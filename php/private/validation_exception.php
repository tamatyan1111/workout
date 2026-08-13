<?php
// バリデーション失敗を表す専用例外。validate.phpの各関数はこれをthrowし、
// 各エンドポイントのcatch節でHTTP 400のJSONエラーに変換する。
// json_error()を直接呼ぶ(内部でexitする)のと違い、PHPUnitで失敗パスを単体テストできる。

class ValidationException extends RuntimeException
{
}
