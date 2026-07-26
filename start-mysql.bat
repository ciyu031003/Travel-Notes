@echo off
set BASEDIR=C:\Program Files\MySQL\MySQL Server 8.4
set DATADIR=F:\CodeFiles\user-brower\personal-blog\mysql-data
"%BASEDIR%\bin\mysqld.exe" --basedir="%BASEDIR%" --datadir="%DATADIR%" --port=3306 --mysqlx=OFF --skip-log-bin --innodb-redo-log-capacity=0