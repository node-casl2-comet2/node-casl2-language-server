"use strict";


import {
    IPCMessageReader, IPCMessageWriter,
    createConnection, IConnection, TextDocumentSyncKind,
    TextDocuments, TextDocument, Diagnostic, DiagnosticSeverity,
    InitializeParams, InitializeResult, TextDocumentPositionParams,
    CompletionItem, CompletionItemKind, Position,
    SignatureHelp, Location, RequestType
} from "vscode-languageserver";
import { validateSource, LanguageServices, updateOption } from "./services/core";
import { Casl2CompileOption } from "@maxfield/node-casl2-core";
import { Settings } from "./serverSettings";
import * as linter from "./linter/linter";
import { FixAllProblemsRequestParams, FixAllProblemsRequestResponse } from "./ipc/types";

// サーバー用のコネクションを作成する
const connection: IConnection = createConnection(new IPCMessageReader(process), new IPCMessageWriter(process));

// ファイル内容全体を同期するテキストマネージャーを作成する
const documents: TextDocuments = new TextDocuments();

// テキストドキュメントマネージャーをコネクションの上で購読させる
documents.listen(connection);

// サーバーが起動したらクライアントから初期化のリクエストが届く
// サーバーはクライアントのワークスペースのルートパスとクライアントの能力を受け取る
let workspaceRoot: string | undefined;
connection.onInitialize((params): InitializeResult => {
    // クライアントのルートパスを受け取る
    workspaceRoot = params.rootPath || undefined;
    return {
        capabilities: {
            // クライントにサーバーがフルテキストドキュメント同期モードであることを伝える
            textDocumentSync: documents.syncKind,
            // クライアントにサーバーがコード補完に対応していることを伝える
            completionProvider: {
                resolveProvider: false,
                triggerCharacters: [",", " "]
            },
            // goto definitionが使えるか
            definitionProvider: true,
            // find all referencesが使えるか
            referencesProvider: true,
            // 同じオブジェクトをハイライトする
            documentHighlightProvider: true,
            // 同一シンボルを一度にリネームする
            renameProvider: true,
            // 関数などの定義にジャンプできるようにする
            documentSymbolProvider: true,
            // シンボルにホバーした時に説明を表示する
            hoverProvider: true,
            // 関数の引数の説明を表示する
            signatureHelpProvider: {
                triggerCharacters: [",", " "]
            },
            // CodeAction(vscodeでは電球マークがでる)に対応
            codeActionProvider: true,
            // ドキュメント全体のコード整形に対応
            documentFormattingProvider: true
        }
    }
});

// ファイルの内容が変更された時のイベント。
// このイベントはファイルが最初に開かれた時と内容が変更された時に発行される。
documents.onDidChangeContent(change => validateTextDocument(change.document));

// linterを発動する
documents.onDidChangeContent(change => linter.validateDocument(change.document, connection));

// 補完を提供する
connection.onCompletion(textDocumentPosition => LanguageServices.completion(textDocumentPosition.position));

// 定義へ移動を提供する
connection.onDefinition(({ textDocument, position }) => LanguageServices.gotoDefinition(textDocument.uri, position));

// find all references
connection.onReferences(({ textDocument, position, context }) => LanguageServices.findAllReferences(textDocument.uri, position, context));

// document documenthighlight
connection.onDocumentHighlight(({ textDocument, position }) => LanguageServices.documentHighlight(textDocument.uri, position));

// rename symbols
connection.onRenameRequest(({ textDocument, position, newName }) => {
    const document = documents.get(textDocument.uri);
    const version = document.version;
    return LanguageServices.rename(textDocument.uri, version, position, newName);
});

// list document symbols
connection.onDocumentSymbol(({ textDocument }) => LanguageServices.documentSymbol(textDocument.uri));

// show hovers
connection.onHover(({ textDocument, position }) => LanguageServices.hover(textDocument.uri, position));

// signature help
connection.onSignatureHelp(({ textDocument, position }) => LanguageServices.signatureHelp(textDocument.uri, position));

// 設定変更時に発行される
connection.onDidChangeConfiguration((change) => {
    const newCasl2Options = (change.settings as Settings).casl2;
    updateOption(newCasl2Options);

    // すべてのファイルを再検証する
    documents.all().forEach(validateTextDocument);
});

// CodeAction時に呼ばれる
connection.onCodeAction((params) => linter.codeAction(params));

// Document formatting
connection.onDocumentFormatting((params) => LanguageServices.documentFormatting(params));

// カスタムリクエストを処理する
connection.onRequest(
    new RequestType<FixAllProblemsRequestParams, FixAllProblemsRequestResponse, void, void>("textDocument/casl2-lint/fixAllProblems"),
    (params) => linter.fixAllProblems(params));

// テキストファイルを検証する
function validateTextDocument(textDocument: TextDocument): void {
    // 行のリストにする
    const lines = textDocument.getText().split(/\r?\n/g);

    const diagnostics = validateSource(lines);

    // 検証情報をクライアントに送る
    connection.sendDiagnostics({ uri: textDocument.uri, diagnostics: diagnostics });
}

// 接続を待ち受ける
connection.listen();
