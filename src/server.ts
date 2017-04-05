"use strict";


import {
    IPCMessageReader, IPCMessageWriter,
    createConnection, IConnection, TextDocumentSyncKind,
    TextDocuments, TextDocument, Diagnostic, DiagnosticSeverity,
    InitializeParams, InitializeResult, TextDocumentPositionParams,
    CompletionItem, CompletionItemKind, Position,
    SignatureHelp, Location, RequestType, TextDocumentChangeEvent
} from "vscode-languageserver";
import { validateSource, LanguageServices, updateOption, getCurrenctDiagnostics } from "./services/core";
import { Casl2CompileOption } from "@maxfield/node-casl2-core";
import { Settings } from "./serverSettings";
import * as linter from "./linter/linter";
import { FixAllProblemsRequestParams, FixAllProblemsRequestResponse } from "./ipc/types";
import * as Rx from "@reactivex/rxjs";
import { validateTextDocument } from "./services/core";

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
documents.onDidChangeContent(change => triggerLinterAnalysis(change.document, connection));

documents.onDidClose((change) => handleDocumentClose(change));

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

    const linterEnabled = newCasl2Options.linter !== undefined && newCasl2Options.linter.enabled;
    linter.setEnabled(linterEnabled);

    // すべてのファイルを再検証する
    documents.all().forEach(document => triggerLinterAnalysis(document, connection));
});

// CodeAction時に呼ばれる
connection.onCodeAction((params) => linter.codeAction(params));

// Document formatting
connection.onDocumentFormatting((params) => LanguageServices.documentFormatting(params));

// カスタムリクエストを処理する
connection.onRequest(
    new RequestType<FixAllProblemsRequestParams, FixAllProblemsRequestResponse, void, void>("textDocument/casl2-lint/fixAllProblems"),
    (params) => linter.fixAllProblems(params));

// 接続を待ち受ける
connection.listen();

// debounce: 一定時間値が流れなければ，直前の値で発火する
const subject = new Rx.Subject<[TextDocument, IConnection]>();
subject
    .debounceTime(200)
    .subscribe(([document, connection]) => {
        const { uri } = document;

        const languageServiceDiagnostics = getCurrenctDiagnostics();
        const linterDiagnostics = getLinterDiagnostics();
        const diagnostics = languageServiceDiagnostics.concat(linterDiagnostics);

        connection.sendDiagnostics({ uri, diagnostics });

        function getLinterDiagnostics() {
            const worker = linter.getWorker(document.uri);
            worker.loadDocument(document);

            if (linter.isEnabled()) {
                worker.diagnoseSource();
                return worker.diagnostics;
            } else {
                return [];
            }
        }
    });

function triggerLinterAnalysis(document: TextDocument, connection: IConnection) {
    subject.next([document, connection]);
}

function handleDocumentClose(change: TextDocumentChangeEvent): void {
    const uri = change.document.uri;

    linter.dispose(uri);

    // ファイルが閉じられた時にそのファイルのDiagnosticsを空にする
    connection.sendDiagnostics({ uri: uri, diagnostics: [] });
}
