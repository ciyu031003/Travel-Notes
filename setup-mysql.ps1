$mysqlBase = "C:\Program Files\MySQL\MySQL Server 8.4"
$mysqlExe = "$mysqlBase\bin\mysql.exe"

Write-Output "Step 1: Setting root password..."
$result1 = & $mysqlExe -u root -e "ALTER USER 'root'@'localhost' IDENTIFIED BY 'Abd123456.'; FLUSH PRIVILEGES;" 2>&1
Write-Output $result1
Write-Output "Exit: $LASTEXITCODE"

Write-Output "Step 2: Testing connection with new password..."
$env:MYSQL_PWD = "Abd123456."
$result2 = & $mysqlExe -u root -e "SELECT 'OK' AS connection_test;" 2>&1
Write-Output $result2
Write-Output "Exit: $LASTEXITCODE"

Write-Output "Step 3: Creating Travel_And_Study database..."
$result3 = & $mysqlExe -u root -e "CREATE DATABASE IF NOT EXISTS Travel_And_Study CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>&1
Write-Output $result3
Write-Output "Exit: $LASTEXITCODE"

Write-Output "Step 4: Verifying database..."
$result4 = & $mysqlExe -u root -e "SHOW DATABASES;" 2>&1
Write-Output $result4

Write-Output "All done!"