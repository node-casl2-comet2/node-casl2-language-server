"use strict";


import {
    IPCMessageReader, IPCMessageWriter,
    createConnection, IConnection, TextDocumentSyncKind,
    TextDocuments, TextDocument, Diagnostic, DiagnosticSeverity,
    InitializeParams, InitializeResult, TextDocumentPositionParams,
    CompletionItem, CompletionItemKind, Position,
    SignatureHelp, Location
} from "vscode-languageserver";
import {
    validateSource, completion, gotoDefinition, findAllReferences,
    documentHighlight, rename, documentSymbol, hover, signatureHelp
} from "./casl2";

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
            }
        }
    }
});

// ファイルの内容が変更された時のイベント。
// このイベントはファイルが最初に開かれた時と内容が変更された時に発行される。
documents.onDidChangeContent(change => validateTextDocument(change.document));

// 補完を提供する
connection.onCompletion(textDocumentPosition => completion(textDocumentPosition.position));

// 定義へ移動を提供する
connection.onDefinition(({ textDocument, position }) => gotoDefinition(textDocument.uri, position));

// find all references
connection.onReferences(({ textDocument, position, context }) => findAllReferences(textDocument.uri, position, context));

// document documenthighlight
connection.onDocumentHighlight(({ textDocument, position }) => documentHighlight(textDocument.uri, position));

// rename symbols
connection.onRenameRequest(({ textDocument, position, newName }) => {
    const document = documents.get(textDocument.uri);
    const version = document.version;
    return rename(textDocument.uri, version, position, newName);
});

// list document symbols
connection.onDocumentSymbol(({ textDocument }) => documentSymbol(textDocument.uri));

// show hovers
connection.onHover(({ textDocument, position }) => hover(textDocument.uri, position));

// signature help
connection.onSignatureHelp(({ textDocument, position }) => signatureHelp(textDocument.uri, position));

// サーバー関連の設定部分のインターフェース
interface Settings {
    languageServerExample: ServerSettings;
}

// クライアントのpackage.jsonで定義した設定例
interface ServerSettings {
}


// 設定変更時に発行される
connection.onDidChangeConfiguration((change) => {
    const settings = <Settings>change.settings;

    // すべてのファイルを再検証する
    documents.all().forEach(validateTextDocument);
});

// テキストファイルを検証する
function validateTextDocument(textDocument: TextDocument): void {
    console.log("ON CHANGE CONTENT");

    // 行のリストにする
    const lines = textDocument.getText().split(/\r?\n/g);

    const diagnostics = validateSource(lines);

    // 検証情報をクライアントに送る
    connection.sendDiagnostics({ uri: textDocument.uri, diagnostics: diagnostics });
}

connection.onDidChangeWatchedFiles((change) => {
    // 監視しているファイルがvscodeで変更された
    connection.console.log("We recevied an file change event");
});

// 追加の情報を補完リストに与える
connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
    return item;
});

// 接続を待ち受ける
connection.listen();
