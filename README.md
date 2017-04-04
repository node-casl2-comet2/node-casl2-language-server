## node-casl2-language-server

[![Build Status](https://travis-ci.org/node-casl2-comet2/node-casl2-language-server.svg?branch=master)](https://travis-ci.org/node-casl2-comet2/node-casl2-language-server)
[![Coverage Status](https://coveralls.io/repos/github/node-casl2-comet2/node-casl2-language-server/badge.svg?branch=master)](https://coveralls.io/github/node-casl2-comet2/node-casl2-language-server?branch=master)

node-casl2-language-serverはMicrosoftの[Language Server Protocol](https://github.com/Microsoft/language-server-protocol)
に準拠した言語サーバーです。

## Features

### Completion
method: [`'textDocument/completion'`](https://github.com/Microsoft/language-server-protocol/blob/master/protocol.md#textDocument_completion)

命令コード，ラベル，GRのコード補完を行います。

![Completion](http://i.imgur.com/yczq3cu.gif)


### Definition
method: [`'textDocument/definition'`](https://github.com/Microsoft/language-server-protocol/blob/master/protocol.md#textDocument_definition)

シンボルの定義位置を表示します。

![Definition](http://i.imgur.com/teF965X.gif)


### References
method: [`'textDocument/references'`](https://github.com/Microsoft/language-server-protocol/blob/master/protocol.md#textDocument_references)

シンボルへの参照を表示します。

![References](http://i.imgur.com/UFxuPE6.gif)


### Document Highlight
method: [`'textDocument/documentHighlight'`](https://github.com/Microsoft/language-server-protocol/blob/master/protocol.md#textDocument_documentHighlight)

同一のシンボルをハイライトします。

![Document Highlight](http://i.imgur.com/zGVfLH7.gif)


### Rename
method: [`'textDocument/rename'`](https://github.com/Microsoft/language-server-protocol/blob/master/protocol.md#textDocument_rename)

同一のシンボルをリネームします。

![Rename](http://i.imgur.com/dmhmh5J.gif)


### Document Symbol
method: [`'textDocument/documentSymbol'`](https://github.com/Microsoft/language-server-protocol/blob/master/protocol.md#textDocument_documentSymbol)

ドキュメント内のシンボル(サブルーチン，ラベル)を表示します。

![Document Symbol](http://i.imgur.com/n1PmW81.gif)


### Hover
method: [`'textDocument/hover'`](https://github.com/Microsoft/language-server-protocol/blob/master/protocol.md#textDocument_hover)

ホバーしたシンボルの情報を表示します。

![Hover](http://i.imgur.com/6yM375t.gif)


### Signature Help
method: [`'textDocument/signatureHelp'`](https://github.com/Microsoft/language-server-protocol/blob/master/protocol.md#textDocument_signatureHelp)

命令のシグネチャ情報を表示します。

![Signature Help](http://i.imgur.com/neD4IfA.gif)


### Code Action
method: [`'textDocument/codeAction'`](https://github.com/Microsoft/language-server-protocol/blob/master/protocol.md#textDocument_codeAction)

エラーや警告を解消するアクションを提供します。

![Code Action](http://i.imgur.com/35PtZH4.gif)


### Document Formatting
method: [`'textDocument/formatting'`](https://github.com/Microsoft/language-server-protocol/blob/master/protocol.md#textDocument_formatting)

ドキュメント全体のコード整形を行います。

![Document Formatting](http://i.imgur.com/PSWWeWL.gif)


## Author
[Maxfield Walker](https://github.com/MaxfieldWalker)

## License
MIT
