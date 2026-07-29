const fs = require('fs')
const path = require('path')
const mysql = require('mysql2/promise')

const DB_CONFIG = {
  host: 'localhost',
  port: 3306,
  user: 'root',
  password: '',
  database: 'Travel_And_Study',
}

const SOURCE_DIR = 'F:\\All_Files\\Image\\旅游照片'

const CITY_DATA = {
  '博尔塔拉（毕业旅行）': {
    city: '博尔塔拉',
    province: 'xinjiang',
    title: '博尔塔拉 · 毕业旅行',
    description: '毕业季的博尔塔拉，草原辽阔，雪山壮丽，青春与风景的完美邂逅。',
    date: '2024-06-15',
    tags: ['毕业旅行', '新疆', '草原'],
  },
  '喀什': {
    city: '喀什',
    province: 'xinjiang',
    title: '喀什 · 丝路古城',
    description: '千年古城喀什，维吾尔文化浓郁，艾提尕尔清真寺与大巴扎的异域风情。',
    date: '2025-07-20',
    tags: ['新疆', '喀什', '丝路', '古城'],
  },
  '广州': {
    city: '广州',
    province: 'guangdong',
    title: '广州 · 花城漫步',
    description: '羊城广州，珠江夜游，骑楼老街与现代都市的完美融合。',
    date: '2025-03-10',
    tags: ['广州', '广东', '珠江', '美食'],
  },
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  const mimeMap = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
  }
  return mimeMap[ext] || 'image/jpeg'
}

async function main() {
  console.log('=== 重置并导入图片到数据库 ===\n')

  const pool = await mysql.createPool(DB_CONFIG)

  console.log('🗑️ 清理现有数据...')
  await pool.query('DELETE FROM PostImage')
  await pool.query("DELETE FROM Post WHERE type = 'travel'")
  console.log('✅ 已清空旅行记录\n')

  const cityDirs = fs.readdirSync(SOURCE_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())

  for (const dir of cityDirs) {
    const cityFolder = dir.name
    const data = CITY_DATA[cityFolder]

    if (!data) {
      console.log(`⚠️ 跳过未配置的城市: ${cityFolder}`)
      continue
    }

    const sourceImages = fs.readdirSync(path.join(SOURCE_DIR, cityFolder))
      .filter((f) => /\.(jpg|jpeg|png|gif|webp)$/i.test(f))
      .sort()

    if (sourceImages.length === 0) {
      console.log(`⚠️ ${cityFolder} 无图片，跳过`)
      continue
    }

    console.log(`📸 ${cityFolder}: 发现 ${sourceImages.length} 张图片`)

    const slug = `${data.province}-${data.city}-${data.date}`
    const dateStr = `${data.date} 00:00:00.000`

    const [postResult] = await pool.query(
      `INSERT INTO Post (slug, title, content, date, tags, location, summary, createdAt, updatedAt) ` +
      `VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        slug,
        data.title,
        `# ${data.title}\n\n${data.description}\n\n## 旅行详情\n\n- **城市**: ${data.city}\n- **省份**: ${data.province}\n- **日期**: ${data.date}\n\n## 图集\n\n共 ${sourceImages.length} 张精彩照片。`,
        dateStr,
        JSON.stringify(data.tags),
        data.city,
        data.description,
      ]
    )
    const postId = postResult.insertId
    console.log(`✅ 创建文章: ${data.title} (ID: ${postId})`)

    const imageIds = []
    for (let i = 0; i < sourceImages.length; i++) {
      const srcFile = sourceImages[i]
      const srcPath = path.join(SOURCE_DIR, cityFolder, srcFile)

      try {
        const fileBuffer = fs.readFileSync(srcPath)
        const mimeType = getMimeType(srcPath)

        const [imgResult] = await pool.query(
          `INSERT INTO PostImage (postId, data, mimeType, \`order\`, createdAt)
           VALUES (?, ?, ?, ?, NOW())`,
          [postId, fileBuffer, mimeType, i]
        )

        imageIds.push(imgResult.insertId)
        console.log(`   📤 上传图片 ${i + 1}/${sourceImages.length}: ${srcFile} -> ID: ${imgResult.insertId}`)
      } catch (err) {
        console.error(`   ❌ 上传失败 ${srcFile}: ${err.message}`)
      }
    }

    if (imageIds.length > 0) {
      const imageUrls = imageIds.map((id) => `/api/images/${id}`)
      await pool.query(
        `UPDATE Post SET images = ?, cover = ? WHERE id = ?`,
        [JSON.stringify(imageIds), imageUrls[0], postId]
      )
      console.log(`✅ 更新文章: ${imageIds.length} 张图片关联完成\n`)
    }
  }

  await pool.end()
  console.log('=== 导入完成 ===')
}

main()
  .catch((e) => {
    console.error('导入失败:', e)
    process.exit(1)
  })
