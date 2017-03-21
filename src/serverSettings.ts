"use strict";

// サーバー関連の設定部分のインターフェース
export interface Settings {
    casl2: ServerSettings;
}

// クライアントのpackage.jsonで定義した設定例
export interface ServerSettings {
    useGR8AsSp: boolean;
    enableLabelScope: boolean;
}
