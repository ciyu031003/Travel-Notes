const mysql = require('mysql2/promise');
require('dotenv').config();

async function migrate() {
  const dbUrl = process.env.DATABASE_URL || 'mysql://root:Abd123456.@localhost:3306/Travel_And_Study';
  const url = new URL(dbUrl.replace('mysql://', 'http://'));
  const dbName = url.pathname.slice(1);
  
  const connection = await mysql.createConnection({
    host: url.hostname,
    port: url.port || 3306,
    user: url.username,
    password: decodeURIComponent(url.password),
    database: dbName,
    multipleStatements: true,
  });

  try {
    console.log('Checking table name...');
    
    const [tables] = await connection.query(`
      SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = ? AND (TABLE_NAME LIKE '%SiteSetting%' OR TABLE_NAME LIKE '%sitesetting%')
    `, [dbName]);
    
    let tableName = 'sitesetting';
    if (tables.length > 0) {
      tableName = tables[0].TABLE_NAME;
    }
    console.log('Using table:', tableName);

    console.log('Checking if requirePasswordChange column exists...');
    
    const [columns] = await connection.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = 'requirePasswordChange'
    `, [dbName, tableName]);

    if (columns.length === 0) {
      console.log('Adding requirePasswordChange column...');
      await connection.query(`
        ALTER TABLE \`${tableName}\` 
        ADD COLUMN requirePasswordChange BOOLEAN NOT NULL DEFAULT FALSE
      `);
      console.log('Column added successfully.');
      
      const [countResult] = await connection.query(`SELECT COUNT(*) as cnt FROM \`${tableName}\``);
      if (countResult[0].cnt > 0) {
        const [adminRows] = await connection.query(`SELECT username FROM \`${tableName}\` LIMIT 1`);
        const adminUsername = adminRows[0].username;
        if (adminUsername === 'yuanabd') {
          console.log('Setting requirePasswordChange = TRUE for default admin...');
          await connection.query(`
            UPDATE \`${tableName}\` SET requirePasswordChange = TRUE WHERE username = 'yuanabd'
          `);
          console.log('Done.');
        }
      }
    } else {
      console.log('Column requirePasswordChange already exists.');
    }

    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

migrate();
