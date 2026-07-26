@echo off
set MYSQL_HOME=C:\Program Files\MySQL\MySQL Server 8.4
set LOG=F:\CodeFiles\user-brower\personal-blog\mysql-setup-log.txt

echo === MySQL Setup Log === > %LOG%
echo. >> %LOG%

echo Step 1: Setting root password... >> %LOG%
"%MYSQL_HOME%\bin\mysql.exe" -u root -e "ALTER USER 'root'@'localhost' IDENTIFIED BY 'Abd123456.'; FLUSH PRIVILEGES;" >> %LOG% 2>&1
echo Exit: %ERRORLEVEL% >> %LOG%
echo. >> %LOG%

echo Step 2: Testing connection... >> %LOG%
set MYSQL_PWD=Abd123456.
"%MYSQL_HOME%\bin\mysql.exe" -u root -e "SELECT 'OK' AS connection_test;" >> %LOG% 2>&1
echo Exit: %ERRORLEVEL% >> %LOG%
echo. >> %LOG%

echo Step 3: Creating Travel_And_Study database... >> %LOG%
"%MYSQL_HOME%\bin\mysql.exe" -u root -e "CREATE DATABASE IF NOT EXISTS Travel_And_Study CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" >> %LOG% 2>&1
echo Exit: %ERRORLEVEL% >> %LOG%
echo. >> %LOG%

echo Step 4: Verifying databases... >> %LOG%
"%MYSQL_HOME%\bin\mysql.exe" -u root -e "SHOW DATABASES;" >> %LOG% 2>&1
echo Exit: %ERRORLEVEL% >> %LOG%
echo. >> %LOG%

echo === All done! === >> %LOG%