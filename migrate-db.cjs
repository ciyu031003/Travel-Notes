const mysql = require('mysql2/promise');
require('dotenv').config();

async function migrate() {
  const dbUrl = process.env.DATABASE_URL || 'mysql://root:Abd123456.@localhost:3306/Travel_And_Study';
  const url = new URL(dbUrl.replace('mysql://', 'http://'));
  const dbName = decodeURIComponent(url.pathname.slice(1));
  
  const connection = await mysql.createConnection({
    host: url.hostname,
    port: parseInt(url.port || '3306'),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: dbName,
    multipleStatements: true,
  });

  try {
    console.log('Connected to database:', dbName);
    
    const [tables] = await connection.query(
      "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'Post'",
      [dbName]
    );

    if (tables.length === 0) {
      console.log('Creating Post table...');
      await connection.query(`
        CREATE TABLE Post (
          id INT NOT NULL AUTO_INCREMENT,
          slug VARCHAR(255) NOT NULL,
          title VARCHAR(255) NOT NULL,
          content TEXT NOT NULL,
          date DATETIME(3) NOT NULL,
          cover VARCHAR(500) NULL,
          images TEXT NULL,
          tags TEXT NULL,
          location VARCHAR(255) NULL,
          type VARCHAR(50) NOT NULL DEFAULT 'travel',
          summary TEXT NULL,
          published BOOLEAN NOT NULL DEFAULT TRUE,
          createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
          PRIMARY KEY (id),
          UNIQUE KEY Post_slug_key (slug),
          INDEX Post_type_idx (type),
          INDEX Post_date_idx (date)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log('Post table created successfully.');
    } else {
      console.log('Post table exists, checking and fixing columns...');
      
      const [columns] = await connection.query(
        "SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'Post'",
        [dbName]
      );
      
      const colMap = {};
      columns.forEach(c => { colMap[c.COLUMN_NAME] = c; });
      console.log('Existing columns:', Object.keys(colMap).join(', '));
      
      const alterStatements = [];
      
      if (!colMap.slug) alterStatements.push("ADD COLUMN slug VARCHAR(255) NOT NULL DEFAULT ''");
      if (!colMap.title) alterStatements.push("ADD COLUMN title VARCHAR(255) NOT NULL DEFAULT ''");
      if (!colMap.content) alterStatements.push("ADD COLUMN content TEXT NOT NULL");
      if (!colMap.date) alterStatements.push("ADD COLUMN date DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)");
      if (!colMap.cover) alterStatements.push("ADD COLUMN cover VARCHAR(500) NULL");
      if (!colMap.images) alterStatements.push("ADD COLUMN images TEXT NULL");
      if (!colMap.tags) alterStatements.push("ADD COLUMN tags TEXT NULL");
      if (!colMap.location) alterStatements.push("ADD COLUMN location VARCHAR(255) NULL");
      if (!colMap.type) alterStatements.push("ADD COLUMN type VARCHAR(50) NOT NULL DEFAULT 'travel'");
      if (!colMap.summary) alterStatements.push("ADD COLUMN summary TEXT NULL");
      if (!colMap.published) alterStatements.push("ADD COLUMN published BOOLEAN NOT NULL DEFAULT TRUE");
      
      if (!colMap.createdAt) {
        alterStatements.push("ADD COLUMN createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)");
      } else {
        const col = colMap.createdAt;
        if (!col.COLUMN_DEFAULT || !col.EXTRA.includes('DEFAULT_GENERATED')) {
          console.log('Fixing createdAt default value...');
          alterStatements.push("MODIFY COLUMN createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)");
        }
      }
      
      if (!colMap.updatedAt) {
        alterStatements.push("ADD COLUMN updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)");
      } else {
        const col = colMap.updatedAt;
        if (!col.COLUMN_DEFAULT || !col.EXTRA.includes('on update')) {
          console.log('Fixing updatedAt default value and ON UPDATE...');
          alterStatements.push("MODIFY COLUMN updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)");
        }
      }
      
      if (colMap.type && colMap.type.COLUMN_TYPE && colMap.type.COLUMN_TYPE.includes('enum')) {
        console.log('Converting type from ENUM to VARCHAR for compatibility...');
        alterStatements.push("MODIFY COLUMN type VARCHAR(50) NOT NULL DEFAULT 'travel'");
      }
      
      for (const stmt of alterStatements) {
        try {
          await connection.query(`ALTER TABLE Post ${stmt}`);
          console.log('  OK:', stmt.substring(0, 60) + '...');
        } catch (e) {
          console.log('  Skip:', stmt.substring(0, 40) + '... -', e.message?.substring(0, 80));
        }
      }
      
      const [indexes] = await connection.query(
        "SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'Post'",
        [dbName]
      );
      const indexNames = indexes.map(i => i.INDEX_NAME);
      
      if (!indexNames.includes('Post_slug_key')) {
        try {
          await connection.query("ALTER TABLE Post ADD UNIQUE INDEX Post_slug_key (slug)");
          console.log('Added unique index on slug');
        } catch (e) {
          console.log('Unique index note:', e.message?.substring(0, 80));
        }
      }
      if (!indexNames.includes('Post_type_idx')) {
        await connection.query("ALTER TABLE Post ADD INDEX Post_type_idx (type)").catch(() => {});
      }
      if (!indexNames.includes('Post_date_idx')) {
        await connection.query("ALTER TABLE Post ADD INDEX Post_date_idx (date)").catch(() => {});
      }
    }
    
    const [siteTables] = await connection.query(
      "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'SiteSetting'",
      [dbName]
    );
    
    if (siteTables.length === 0) {
      console.log('Creating SiteSetting table...');
      await connection.query(`
        CREATE TABLE SiteSetting (
          id INT NOT NULL AUTO_INCREMENT,
          username VARCHAR(255) NOT NULL,
          passwordHash TEXT NOT NULL,
          email VARCHAR(255) NULL,
          emailVerified BOOLEAN NOT NULL DEFAULT FALSE,
          resetToken VARCHAR(255) NULL,
          resetTokenExp DATETIME(3) NULL,
          requirePasswordChange BOOLEAN NOT NULL DEFAULT FALSE,
          createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
          PRIMARY KEY (id),
          UNIQUE KEY SiteSetting_username_key (username)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log('SiteSetting table created.');
    } else {
      const [siteCols] = await connection.query(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'SiteSetting'",
        [dbName]
      );
      const siteColNames = siteCols.map(c => c.COLUMN_NAME);
      
      if (!siteColNames.includes('requirePasswordChange')) {
        await connection.query("ALTER TABLE SiteSetting ADD COLUMN requirePasswordChange BOOLEAN NOT NULL DEFAULT FALSE").catch(() => {});
        console.log('Added requirePasswordChange column to SiteSetting');
      }
      if (!siteColNames.includes('createdAt')) {
        await connection.query("ALTER TABLE SiteSetting ADD COLUMN createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)").catch(() => {});
      }
      if (!siteColNames.includes('updatedAt')) {
        await connection.query("ALTER TABLE SiteSetting ADD COLUMN updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)").catch(() => {});
      }
    }

    const [blacklistTables] = await connection.query(
      "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'TokenBlacklist'",
      [dbName]
    );

    if (blacklistTables.length === 0) {
      console.log('Creating TokenBlacklist table...');
      await connection.query(`
        CREATE TABLE TokenBlacklist (
          jti VARCHAR(64) NOT NULL,
          expiresAt DATETIME(3) NOT NULL,
          createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          PRIMARY KEY (jti),
          INDEX TokenBlacklist_expiresAt_idx (expiresAt)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log('TokenBlacklist table created.');
    }

    const [momentTables] = await connection.query(
      "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'Moment'",
      [dbName]
    );

    if (momentTables.length === 0) {
      console.log('Creating Moment table...');
      await connection.query(`
        CREATE TABLE Moment (
          id INT NOT NULL AUTO_INCREMENT,
          content TEXT NOT NULL,
          tags TEXT NULL,
          createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
          PRIMARY KEY (id),
          INDEX Moment_createdAt_idx (createdAt)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log('Moment table created.');
    } else {
      const [momentCols] = await connection.query(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'Moment'",
        [dbName]
      );
      const momentColNames = momentCols.map(c => c.COLUMN_NAME);
      if (!momentColNames.includes('content')) {
        await connection.query("ALTER TABLE Moment ADD COLUMN content TEXT NOT NULL").catch(() => {});
      }
      if (!momentColNames.includes('tags')) {
        await connection.query("ALTER TABLE Moment ADD COLUMN tags TEXT NULL").catch(() => {});
      }
      if (!momentColNames.includes('createdAt')) {
        await connection.query("ALTER TABLE Moment ADD COLUMN createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)").catch(() => {});
      }
      if (!momentColNames.includes('updatedAt')) {
        await connection.query("ALTER TABLE Moment ADD COLUMN updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)").catch(() => {});
      }
    }

    const [likeTables] = await connection.query(
      "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'Like'",
      [dbName]
    );

    if (likeTables.length === 0) {
      console.log('Creating Like table...');
      await connection.query(`
        CREATE TABLE \`Like\` (
          id INT NOT NULL AUTO_INCREMENT,
          targetType VARCHAR(50) NOT NULL,
          targetId VARCHAR(255) NOT NULL,
          visitorId VARCHAR(64) NOT NULL,
          createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          PRIMARY KEY (id),
          UNIQUE KEY Like_target_unique (targetType, targetId, visitorId),
          INDEX Like_target_idx (targetType, targetId),
          INDEX Like_createdAt_idx (createdAt)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log('Like table created.');
    }
    const [photoMsgTables] = await connection.query(
      "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'PhotoMessage'",
      [dbName]
    );

    if (photoMsgTables.length === 0) {
      console.log('Creating PhotoMessage table...');
      await connection.query(`
        CREATE TABLE PhotoMessage (
          id INT NOT NULL AUTO_INCREMENT,
          imageKey VARCHAR(500) NOT NULL,
          content TEXT NOT NULL,
          createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          PRIMARY KEY (id),
          INDEX PhotoMessage_imageKey_createdAt_idx (imageKey, createdAt)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log('PhotoMessage table created.');
    }
    console.log('\n✓ Database migration completed successfully!');
    console.log('  Now try creating a post again.');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

migrate();


