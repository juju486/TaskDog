import os
import shutil
import datetime

# 备份脚本
print("开始备份重要文件...")

backup_dir = f"C:\\Backup\\{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}"
os.makedirs(backup_dir, exist_ok=True)

# 备份桌面
desktop = os.path.join(os.path.expanduser('~'), 'Desktop')
if os.path.exists(desktop):
    shutil.copytree(desktop, os.path.join(backup_dir, 'Desktop'))
    print(f"桌面备份完成: {desktop}")

# 备份文档
documents = os.path.join(os.path.expanduser('~'), 'Documents')
if os.path.exists(documents):
    shutil.copytree(documents, os.path.join(backup_dir, 'Documents'))
    print(f"文档备份完成: {documents}")

print(f"备份完成！位置: {backup_dir}")
