const mysql = require('mysql2/promise');
require('dotenv').config();

async function migrate() {
  const dbUrl = process.env.DATABASE_URL || 'mysql://root:CHANGE_ME@localhost:3306/Travel_And_Study';
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
    // ============ 新数据模型（Phase 0/1：Session + Space/Travel/Memory/Media/AuditLog）============
    // 说明：本脚本为部署兜底；权威迁移请使用 `npx prisma db push`。
    // 这里只建表 + 索引，不加外键约束（避免建表顺序依赖）。

    const tableDefinitions = [
      {
        name: 'Session',
        sql: `CREATE TABLE IF NOT EXISTS Session (
          id VARCHAR(64) NOT NULL,
          username VARCHAR(255) NOT NULL,
          expiresAt DATETIME(3) NOT NULL,
          createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          lastUsedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          userAgent VARCHAR(500) NULL,
          ipHash VARCHAR(128) NULL,
          revokedAt DATETIME(3) NULL,
          PRIMARY KEY (id),
          INDEX Session_username_expiresAt_idx (username, expiresAt),
          INDEX Session_expiresAt_idx (expiresAt)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
      },
      {
        name: 'Space',
        sql: `CREATE TABLE IF NOT EXISTS Space (
          id INT NOT NULL AUTO_INCREMENT,
          name VARCHAR(200) NOT NULL,
          slug VARCHAR(200) NOT NULL,
          description TEXT NULL,
          coverMediaId INT NULL,
          createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
          PRIMARY KEY (id),
          UNIQUE KEY Space_slug_key (slug),
          UNIQUE KEY Space_coverMediaId_key (coverMediaId),
          INDEX Space_slug_idx (slug)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
      },
      {
        name: 'SpaceMember',
        sql: `CREATE TABLE IF NOT EXISTS SpaceMember (
          id INT NOT NULL AUTO_INCREMENT,
          spaceId INT NOT NULL,
          username VARCHAR(255) NOT NULL,
          role ENUM('OWNER','MEMBER','VIEWER') NOT NULL DEFAULT 'MEMBER',
          status ENUM('ACTIVE','INVITED','REMOVED') NOT NULL DEFAULT 'ACTIVE',
          joinedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          PRIMARY KEY (id),
          UNIQUE KEY SpaceMember_spaceId_username_key (spaceId, username),
          INDEX SpaceMember_spaceId_role_idx (spaceId, role)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
      },
      {
        name: 'SpaceInvite',
        sql: `CREATE TABLE IF NOT EXISTS SpaceInvite (
          id INT NOT NULL AUTO_INCREMENT,
          spaceId INT NOT NULL,
          tokenHash VARCHAR(128) NOT NULL,
          role ENUM('OWNER','MEMBER','VIEWER') NOT NULL DEFAULT 'MEMBER',
          expiresAt DATETIME(3) NOT NULL,
          createdBy VARCHAR(255) NOT NULL,
          usedAt DATETIME(3) NULL,
          createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          PRIMARY KEY (id),
          UNIQUE KEY SpaceInvite_tokenHash_key (tokenHash),
          INDEX SpaceInvite_spaceId_idx (spaceId)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
      },
      {
        name: 'Media',
        sql: `CREATE TABLE IF NOT EXISTS Media (
          id INT NOT NULL AUTO_INCREMENT,
          spaceId INT NULL,
          memoryId INT NULL,
          type ENUM('IMAGE','VIDEO','AUDIO') NOT NULL,
          storageKey VARCHAR(500) NOT NULL,
          mimeType VARCHAR(100) NOT NULL,
          size INT NOT NULL DEFAULT 0,
          width INT NULL,
          height INT NULL,
          duration INT NULL,
          hash VARCHAR(128) NULL,
          takenAt DATETIME(3) NULL,
          latitude DOUBLE NULL,
          longitude DOUBLE NULL,
          visibility ENUM('PRIVATE','COUPLE','PUBLIC') NOT NULL DEFAULT 'COUPLE',
          createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          PRIMARY KEY (id),
          INDEX Media_spaceId_type_idx (spaceId, type),
          INDEX Media_memoryId_idx (memoryId)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
      },
      {
        name: 'MediaVariant',
        sql: `CREATE TABLE IF NOT EXISTS MediaVariant (
          id INT NOT NULL AUTO_INCREMENT,
          mediaId INT NOT NULL,
          variant ENUM('ORIGINAL','THUMBNAIL','PREVIEW','BLUR') NOT NULL,
          storageKey VARCHAR(500) NOT NULL,
          width INT NULL,
          height INT NULL,
          size INT NOT NULL DEFAULT 0,
          mimeType VARCHAR(100) NOT NULL,
          PRIMARY KEY (id),
          UNIQUE KEY MediaVariant_mediaId_variant_key (mediaId, variant)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
      },
      {
        name: 'Travel',
        sql: `CREATE TABLE IF NOT EXISTS Travel (
          id INT NOT NULL AUTO_INCREMENT,
          spaceId INT NOT NULL,
          title VARCHAR(255) NOT NULL,
          slug VARCHAR(255) NOT NULL,
          description TEXT NULL,
          startDate DATETIME(3) NULL,
          endDate DATETIME(3) NULL,
          coverMediaId INT NULL,
          status ENUM('PLANNED','ONGOING','COMPLETED') NOT NULL DEFAULT 'PLANNED',
          visibility ENUM('PRIVATE','COUPLE','PUBLIC') NOT NULL DEFAULT 'COUPLE',
          createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
          PRIMARY KEY (id),
          UNIQUE KEY Travel_spaceId_slug_key (spaceId, slug),
          INDEX Travel_spaceId_startDate_idx (spaceId, startDate)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
      },
      {
        name: 'TravelDay',
        sql: `CREATE TABLE IF NOT EXISTS TravelDay (
          id INT NOT NULL AUTO_INCREMENT,
          travelId INT NOT NULL,
          date DATETIME(3) NULL,
          title VARCHAR(255) NULL,
          summary TEXT NULL,
          sortOrder INT NOT NULL DEFAULT 0,
          PRIMARY KEY (id),
          INDEX TravelDay_travelId_sortOrder_idx (travelId, sortOrder)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
      },
      {
        name: 'Location',
        sql: `CREATE TABLE IF NOT EXISTS Location (
          id INT NOT NULL AUTO_INCREMENT,
          name VARCHAR(255) NOT NULL,
          address VARCHAR(500) NULL,
          country VARCHAR(100) NULL,
          city VARCHAR(100) NULL,
          latitude DOUBLE NULL,
          longitude DOUBLE NULL,
          externalId VARCHAR(255) NULL,
          metadata TEXT NULL,
          createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
          PRIMARY KEY (id),
          INDEX Location_city_idx (city),
          INDEX Location_name_idx (name)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
      },
      {
        name: 'Memory',
        sql: `CREATE TABLE IF NOT EXISTS Memory (
          id INT NOT NULL AUTO_INCREMENT,
          spaceId INT NOT NULL,
          travelId INT NULL,
          travelDayId INT NULL,
          title VARCHAR(255) NOT NULL,
          content TEXT NULL,
          happenedAt DATETIME(3) NULL,
          locationId INT NULL,
          mood VARCHAR(50) NULL,
          visibility ENUM('PRIVATE','COUPLE','PUBLIC') NOT NULL DEFAULT 'COUPLE',
          createdBy VARCHAR(255) NOT NULL,
          createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
          PRIMARY KEY (id),
          INDEX Memory_spaceId_happenedAt_idx (spaceId, happenedAt),
          INDEX Memory_spaceId_travelId_idx (spaceId, travelId)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
      },
      {
        name: 'Album',
        sql: `CREATE TABLE IF NOT EXISTS Album (
          id INT NOT NULL AUTO_INCREMENT,
          spaceId INT NOT NULL,
          title VARCHAR(255) NOT NULL,
          description TEXT NULL,
          coverMediaId INT NULL,
          date DATETIME(3) NULL,
          locationId INT NULL,
          visibility ENUM('PRIVATE','COUPLE','PUBLIC') NOT NULL DEFAULT 'COUPLE',
          createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
          PRIMARY KEY (id),
          INDEX Album_spaceId_createdAt_idx (spaceId, createdAt)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
      },
      {
        name: 'AlbumMedia',
        sql: `CREATE TABLE IF NOT EXISTS AlbumMedia (
          id INT NOT NULL AUTO_INCREMENT,
          albumId INT NOT NULL,
          mediaId INT NOT NULL,
          sortOrder INT NOT NULL DEFAULT 0,
          PRIMARY KEY (id),
          UNIQUE KEY AlbumMedia_albumId_mediaId_key (albumId, mediaId)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
      },
      {
        name: 'AuditLog',
        sql: `CREATE TABLE IF NOT EXISTS AuditLog (
          id INT NOT NULL AUTO_INCREMENT,
          spaceId INT NULL,
          username VARCHAR(255) NOT NULL,
          action ENUM('LOGIN','LOGOUT','CREATE','UPDATE','DELETE','UPLOAD_MEDIA','DELETE_MEDIA','INVITE_MEMBER','UPDATE_PERMISSIONS','CHANGE_PASSWORD','SETTINGS_UPDATE') NOT NULL,
          resourceType VARCHAR(100) NULL,
          resourceId VARCHAR(255) NULL,
          metadata TEXT NULL,
          ipHash VARCHAR(128) NULL,
          createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          PRIMARY KEY (id),
          INDEX AuditLog_spaceId_createdAt_idx (spaceId, createdAt),
          INDEX AuditLog_username_createdAt_idx (username, createdAt),
          INDEX AuditLog_action_idx (action)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
      },
    ];

      {
        name: 'Anniversary',
        sql: `CREATE TABLE IF NOT EXISTS Anniversary (
          id INT NOT NULL AUTO_INCREMENT,
          title VARCHAR(255) NOT NULL,
          date DATETIME(3) NOT NULL,
          recurring BOOLEAN NOT NULL DEFAULT TRUE,
          description TEXT NULL,
          coverMediaId INT NULL,
          createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
          PRIMARY KEY (id),
          UNIQUE KEY Anniversary_coverMediaId_key (coverMediaId),
          INDEX Anniversary_date_idx (date)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
      },
      {
        name: 'ItineraryItem',
        sql: `CREATE TABLE IF NOT EXISTS ItineraryItem (
          id INT NOT NULL AUTO_INCREMENT,
          travelDayId INT NOT NULL,
          startTime DATETIME(3) NULL,
          endTime DATETIME(3) NULL,
          title VARCHAR(255) NOT NULL,
          locationId INT NULL,
          type VARCHAR(50) NOT NULL DEFAULT 'SPOT',
          notes TEXT NULL,
          sortOrder INT NOT NULL DEFAULT 0,
          PRIMARY KEY (id),
          INDEX ItineraryItem_travelDayId_sortOrder_idx (travelDayId, sortOrder)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
      },
      {
        name: 'Expense',
        sql: `CREATE TABLE IF NOT EXISTS Expense (
          id INT NOT NULL AUTO_INCREMENT,
          travelId INT NOT NULL,
          amount DOUBLE NOT NULL,
          currency VARCHAR(10) NOT NULL DEFAULT 'CNY',
          category VARCHAR(50) NOT NULL,
          payer VARCHAR(255) NULL,
          note TEXT NULL,
          happenedAt DATETIME(3) NULL,
          createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          PRIMARY KEY (id),
          INDEX Expense_travelId_idx (travelId)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
      },
    ];

    for (const def of tableDefinitions) {
      const [existing] = await connection.query(
        'SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?',
        [dbName, def.name]
      );
      if (existing.length === 0) {
        await connection.query(def.sql);
        console.log('Created ' + def.name + ' table.');
      } else {
        console.log('Table ' + def.name + ' exists, skip.');
      }
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


