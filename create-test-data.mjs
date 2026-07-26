import mysql from 'mysql2/promise'
import fs from 'fs'
import path from 'path'
import https from 'https'
import http from 'http'

function downloadImage(url, filepath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http
    protocol.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location
        if (redirectUrl) {
          downloadImage(redirectUrl, filepath).then(resolve).catch(reject)
          return
        }
      }
      
      if (response.statusCode !== 200) {
        reject(new Error('Failed to download image: ' + response.statusCode))
        return
      }

      const dir = path.dirname(filepath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }

      const fileStream = fs.createWriteStream(filepath)
      response.pipe(fileStream)
      
      fileStream.on('finish', () => {
        fileStream.close()
        resolve(filepath)
      })
      
      fileStream.on('error', reject)
    }).on('error', reject)
  })
}

async function main() {
  console.log('开始创建测试数据...')

  const connection = await mysql.createConnection({
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: 'Abd123456.',
    database: 'Travel_And_Study',
  })

  console.log('数据库连接成功')

  const uploadDir = path.join(process.cwd(), 'public', 'uploads')
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true })
    console.log('创建上传目录:', uploadDir)
  }

  const timestamp = Date.now()
  
  const imagePrompts = [
    'Guangzhou Canton Tower night scene Pearl River neon lights cityscape China travel',
    'Guangzhou Shangxiajiu pedestrian street traditional architecture dim sum restaurant',
    'Guangzhou Chen Clan Academy traditional Chinese architecture Lingnan style',
  ]

  const imageUrls = []

  for (let i = 0; i < imagePrompts.length; i++) {
    const prompt = encodeURIComponent(imagePrompts[i])
    const apiUrl = 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=' + prompt + '&image_size=landscape_16_9'
    const filename = timestamp + '-guangzhou-' + i + '.jpg'
    const filepath = path.join(uploadDir, filename)
    
    try {
      console.log('正在下载第 ' + (i + 1) + ' 张图片: ' + filename)
      await downloadImage(apiUrl, filepath)
      imageUrls.push('/uploads/' + filename)
      console.log('  下载完成: /uploads/' + filename)
    } catch (error) {
      console.error('  下载失败: ' + error.message)
    }
  }

  if (imageUrls.length === 0) {
    console.log('图片下载失败，使用默认图片URL')
    imageUrls.push('https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=Guangzhou%20Canton%20Tower%20night%20scene%20Pearl%20River%20neon%20lights%20cityscape%20China%20travel&image_size=landscape_16_9')
  }

  const [rows] = await connection.execute(
    'SELECT * FROM Post WHERE slug = ?',
    ['guangzhou-concert-test']
  )

  if (rows.length > 0) {
    console.log('测试记录已存在，更新中...')
    await connection.execute(
      'UPDATE Post SET images = ?, cover = ? WHERE slug = ?',
      [JSON.stringify(imageUrls), imageUrls[0], 'guangzhou-concert-test']
    )
    console.log('测试记录已更新')
  } else {
    console.log('创建新的测试记录...')
    const content = '# 广州演唱会\n\n这是一次难忘的广州旅行，我们去看了一场精彩的演唱会。\n\n## 行程安排\n\n- 第一天：抵达广州，品尝当地美食\n- 第二天：演唱会现场\n- 第三天：游览广州塔，珠江夜游\n\n## 美食推荐\n\n广州的早茶非常有名，推荐品尝虾饺、烧卖、肠粉等经典点心。'
    const summary = '广州演唱会之旅，记录了一次精彩的音乐旅行体验'
    
    await connection.execute(
      `INSERT INTO Post (slug, title, content, date, cover, images, tags, location, type, summary, published, createdAt, updatedAt) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())`,
      [
        'guangzhou-concert-test',
        '广州演唱会之旅',
        content,
        '2024-05-20',
        imageUrls[0],
        JSON.stringify(imageUrls),
        JSON.stringify(['广州', '演唱会', '旅行']),
        '广东广州',
        'travel',
        summary,
      ]
    )
    console.log('测试记录创建成功！')
  }

  const [posts] = await connection.execute(
    'SELECT id, title, location FROM Post WHERE type = ? ORDER BY date DESC',
    ['travel']
  )

  console.log('\n当前共有 ' + posts.length + ' 篇旅行记录:')
  posts.forEach((post, index) => {
    console.log('  ' + (index + 1) + '. ' + post.title + ' (' + post.location + ')')
  })

  await connection.end()
  console.log('\n完成！')
}

main().catch((error) => {
  console.error('错误:', error)
  process.exit(1)
})
