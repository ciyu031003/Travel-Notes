const fs = require('fs')
const path = require('path')

const BASE_URL = 'http://localhost:3001'
const SOURCE_DIR = 'F:\\All_Files\\Image\\旅游照片'
const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads')

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

async function login(username, password) {
  const response = await fetch(`${BASE_URL}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`登录失败: ${response.status} - ${errText}`)
  }

  const cookies = response.headers.get('set-cookie') || ''
  return cookies
}

async function createPost(cookie, postData) {
  const response = await fetch(`${BASE_URL}/api/admin/posts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie,
    },
    body: JSON.stringify(postData),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`创建文章失败: ${response.status} - ${errorText}`)
  }

  return response.json()
}

async function main() {
  console.log('=== 批量导入旅行记录 ===\n')

  const cookie = await login('yuanabd', 'Abd123456.')
  console.log('✅ 登录成功\n')

  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true })
  }

  const timestamp = Date.now()
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

    if (sourceImages.length === 0) {
      console.log(`⚠️ ${cityFolder} 无图片，跳过`)
      continue
    }

    const uploadedImages = []
    for (let i = 0; i < sourceImages.length; i++) {
      const srcFile = sourceImages[i]
      const ext = path.extname(srcFile).toLowerCase()
      const newName = `${timestamp}-${data.province}-${data.city}-${i}${ext}`
      const srcPath = path.join(SOURCE_DIR, cityFolder, srcFile)
      const destPath = path.join(UPLOAD_DIR, newName)

      fs.copyFileSync(srcPath, destPath)
      uploadedImages.push(`/uploads/${newName}`)
    }

    console.log(`📸 ${cityFolder}: ${uploadedImages.length} 张图片已复制`)

    const slug = `${data.province}-${data.city}-${data.date}`

    const postData = {
      slug,
      title: data.title,
      content: `# ${data.title}\n\n${data.description}\n\n## 旅行详情\n\n- **城市**: ${data.city}\n- **省份**: ${data.province}\n- **日期**: ${data.date}\n\n## 图集\n\n共 ${uploadedImages.length} 张精彩照片。`,
      date: data.date,
      cover: uploadedImages[0],
      images: uploadedImages,
      tags: data.tags,
      location: data.city,
      type: 'travel',
      summary: data.description,
      published: true,
    }

    try {
      const result = await createPost(cookie, postData)
      console.log(`✅ 创建成功: ${data.title} (ID: ${result?.data?.post?.id || '未知'})\n`)
    } catch (error) {
      console.error(`❌ 创建失败: ${data.title} - ${error.message}\n`)
    }

    await new Promise((r) => setTimeout(r, 300))
  }

  console.log('=== 导入完成 ===')
}

main().catch(console.error)
