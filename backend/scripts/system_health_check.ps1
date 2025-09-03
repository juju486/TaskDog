# 系统健康检查脚本
Write-Host "=== 系统健康检查 ==="
Write-Host "CPU使用率：" (Get-WmiObject -Class Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average "%"
Write-Host "内存使用率：" ([math]::Round(((Get-WmiObject -Class Win32_OperatingSystem).TotalVisibleMemorySize - (Get-WmiObject -Class Win32_OperatingSystem).FreePhysicalMemory) / (Get-WmiObject -Class Win32_OperatingSystem).TotalVisibleMemorySize * 100, 2)) "%"
Get-WmiObject -Class Win32_LogicalDisk | ForEach-Object { Write-Host "磁盘 $($_.DeviceID) 使用率：" ([math]::Round(($_.Size - $_.FreeSpace) / $_.Size * 100, 2)) "%" }
