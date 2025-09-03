# 网络连接测试脚本
Write-Host "=== 网络连接测试 ===" -ForegroundColor Green

# 测试目标列表
$targets = @(
    @{Name="百度"; Host="www.baidu.com"},
    @{Name="腾讯"; Host="www.qq.com"},
    @{Name="阿里云"; Host="www.aliyun.com"},
    @{Name="微软"; Host="www.microsoft.com"},
    @{Name="谷歌DNS"; Host="8.8.8.8"}
)

# 测试每个目标
foreach ($target in $targets) {
    Write-Host "\n测试 $($target.Name) ($($target.Host))..." -ForegroundColor Yellow
    
    try {
        $result = Test-Connection -ComputerName $target.Host -Count 4 -ErrorAction Stop
        $avgTime = ($result | Measure-Object ResponseTime -Average).Average
        $successRate = ($result | Where-Object {$_.StatusCode -eq 0}).Count / 4 * 100
        
        Write-Host "  ✓ 连接成功" -ForegroundColor Green
        Write-Host "  平均延迟: $([math]::Round($avgTime, 2)) ms" -ForegroundColor Cyan
        Write-Host "  成功率: $successRate%" -ForegroundColor Cyan
    }
    catch {
        Write-Host "  ✗ 连接失败: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host "\n=== 测试完成 ===" -ForegroundColor Green
