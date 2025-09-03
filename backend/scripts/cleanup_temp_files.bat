@echo off
echo 开始清理临时文件...
rd /s /q %temp%
md %temp%
echo 清理用户临时文件完成
rd /s /q C:\Windows\Temp
md C:\Windows\Temp
echo 清理系统临时文件完成
echo 清理回收站...
rd /s /q C:\$Recycle.Bin
echo 清理完成！
