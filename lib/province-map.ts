import { provinces, getProvince, type Province } from "@/data/provinces";

export type { Province } from "@/data/provinces";
export { provinces, getProvince } from "@/data/provinces";

export function findProvinceByLocation(location: string): Province | undefined {
  const provinceKeywords: Record<string, string[]> = {
    beijing: ["北京", "东城区", "西城区", "朝阳区", "海淀区", "丰台区", "石景山区", "通州区", "昌平区", "大兴区", "顺义区", "房山区", "门头沟区", "平谷区", "怀柔区", "密云区", "延庆区"],
    tianjin: ["天津", "津", "和平区", "河东区", "河西区", "南开区", "河北区", "红桥区", "东丽区", "西青区", "津南区", "北辰区", "武清区", "宝坻区", "滨海新区", "宁河区", "静海区", "蓟州区"],
    hebei: ["河北", "石家庄", "唐山", "秦皇岛", "邯郸", "邢台", "保定", "张家口", "承德", "沧州", "廊坊", "衡水", "长安区", "桥西区", "新华区", "井陉矿区", "裕华区", "藁城区", "鹿泉区", "栾城区"],
    shanxi: ["山西", "太原", "大同", "阳泉", "长治", "晋城", "朔州", "晋中", "运城", "忻州", "临汾", "吕梁", "平遥", "祁县", "小店区", "迎泽区", "杏花岭区", "尖草坪区", "万柏林区", "晋源区"],
    neimenggu: ["内蒙古", "呼和浩特", "包头", "乌海", "赤峰", "通辽", "鄂尔多斯", "呼伦贝尔", "巴彦淖尔", "乌兰察布", "兴安盟", "锡林郭勒盟", "阿拉善盟", "新城区", "回民区", "玉泉区", "赛罕区", "青山区", "昆都仑区", "东河区", "九原区"],
    liaoning: ["辽宁", "沈阳", "大连", "鞍山", "抚顺", "本溪", "丹东", "锦州", "营口", "阜新", "辽阳", "盘锦", "铁岭", "朝阳", "葫芦岛", "和平区", "沈河区", "大东区", "皇姑区", "铁西区", "苏家屯区", "浑南区", "旅顺口区", "中山区", "西岗区", "沙河口区", "甘井子区"],
    jilin: ["吉林", "长春", "吉林市", "四平", "辽源", "通化", "白山", "松原", "白城", "延边", "朝鲜族自治州", "延吉", "图们", "敦化", "珲春", "龙井", "和龙", "南关区", "宽城区", "朝阳区", "二道区", "绿园区", "双阳区", "九台区", "昌邑区", "龙潭区", "船营区", "丰满区"],
    heilongjiang: ["黑龙江", "哈尔滨", "齐齐哈尔", "鸡西", "鹤岗", "双鸭山", "大庆", "伊春", "佳木斯", "七台河", "牡丹江", "黑河", "绥化", "大兴安岭", "漠河", "道里区", "南岗区", "道外区", "平房区", "松北区", "香坊区", "呼兰区", "阿城区", "双城区"],
    shanghai: ["上海", "沪", "黄浦区", "徐汇区", "长宁区", "静安区", "普陀区", "虹口区", "杨浦区", "浦东新区", "闵行区", "宝山区", "嘉定区", "金山区", "松江区", "青浦区", "奉贤区", "崇明区"],
    jiangsu: ["江苏", "南京", "无锡", "徐州", "常州", "苏州", "南通", "连云港", "淮安", "盐城", "扬州", "镇江", "泰州", "宿迁", "玄武区", "秦淮区", "建邺区", "鼓楼区", "浦口区", "栖霞区", "雨花台区", "江宁区", "六合区", "锡山区", "惠山区", "滨湖区", "梁溪区"],
    zhejiang: ["浙江", "杭州", "宁波", "温州", "嘉兴", "湖州", "绍兴", "金华", "衢州", "舟山", "台州", "丽水", "上城区", "拱墅区", "西湖区", "滨江区", "萧山区", "余杭区", "临平区", "钱塘区", "海曙区", "江北区", "北仑区", "镇海区", "鄞州区"],
    anhui: ["安徽", "合肥", "芜湖", "蚌埠", "淮南", "马鞍山", "淮北", "铜陵", "安庆", "黄山", "滁州", "阜阳", "宿州", "六安", "亳州", "池州", "宣城", "瑶海区", "庐阳区", "蜀山区", "包河区", "鸠江区", "镜湖区", "弋江区", "湾沚区", "云龙区", "鼓楼区", "蚌山区", "禹会区"],
    fujian: ["福建", "福州", "厦门", "莆田", "三明", "泉州", "漳州", "南平", "龙岩", "宁德", "鼓浪屿", "武夷山", "鼓楼区", "台江区", "仓山区", "马尾区", "晋安区", "长乐区", "思明区", "海沧区", "湖里区", "集美区", "同安区", "翔安区", "鲤城区", "丰泽区", "洛江区", "泉港区"],
    jiangxi: ["江西", "南昌", "景德镇", "萍乡", "九江", "新余", "鹰潭", "赣州", "吉安", "宜春", "抚州", "上饶", "东湖区", "西湖区", "青云谱区", "青山湖区", "新建区", "红谷滩区", "珠山区", "昌江区", "安源区", "湘东区", "庐山区", "浔阳区"],
    shandong: ["山东", "济南", "青岛", "淄博", "枣庄", "东营", "烟台", "潍坊", "济宁", "泰安", "威海", "日照", "临沂", "德州", "聊城", "滨州", "菏泽", "泰山", "曲阜", "历下区", "市中区", "槐荫区", "天桥区", "历城区", "长清区", "市南区", "市北区", "黄岛区", "崂山区", "李沧区", "城阳区"],
    henan: ["河南", "郑州", "开封", "洛阳", "平顶山", "安阳", "鹤壁", "新乡", "焦作", "濮阳", "许昌", "漯河", "三门峡", "南阳", "商丘", "信阳", "周口", "驻马店", "少林寺", "龙门", "云台山", "中原区", "二七区", "管城回族区", "金水区", "上街区", "惠济区", "龙亭区", "顺河回族区", "鼓楼区", "禹王台区", "老城区", "西工区", "瀍河回族区", "涧西区"],
    hubei: ["湖北", "武汉", "黄石", "十堰", "宜昌", "襄阳", "鄂州", "荆门", "孝感", "荆州", "黄冈", "咸宁", "随州", "恩施", "仙桃", "潜江", "天门", "神农架", "江岸区", "江汉区", "硚口区", "汉阳区", "武昌区", "青山区", "洪山区", "东西湖区", "汉南区", "蔡甸区", "江夏区"],
    hunan: ["湖南", "长沙", "株洲", "湘潭", "衡阳", "邵阳", "岳阳", "常德", "张家界", "益阳", "郴州", "永州", "怀化", "娄底", "湘西", "凤凰", "芙蓉区", "天心区", "岳麓区", "开福区", "雨花区", "望城区", "荷塘区", "芦淞区", "石峰区", "天元区"],
    guangdong: ["广东", "广州", "深圳", "珠海", "汕头", "佛山", "江门", "湛江", "茂名", "肇庆", "惠州", "梅州", "汕尾", "河源", "阳江", "清远", "东莞", "中山", "潮州", "揭阳", "云浮", "越秀区", "荔湾区", "海珠区", "天河区", "白云区", "黄埔区", "番禺区", "花都区", "南沙区", "福田区", "罗湖区", "南山区", "宝安区", "龙岗区", "盐田区", "龙华区", "坪山区", "香洲区", "斗门区", "金湾区", "龙湖区", "金平区", "濠江区", "潮南区", "潮阳区"],
    guangxi: ["广西", "南宁", "柳州", "桂林", "梧州", "北海", "防城港", "钦州", "贵港", "玉林", "百色", "贺州", "河池", "来宾", "崇左", "阳朔", "龙脊", "兴宁区", "青秀区", "江南区", "西乡塘区", "良庆区", "邕宁区", "城中区", "鱼峰区", "柳南区", "柳北区", "秀峰区", "叠彩区", "象山区", "七星区", "雁山区"],
    hainan: ["海南", "海口", "三亚", "三沙", "儋州", "五指山", "琼海", "文昌", "万宁", "东方", "定安", "屯昌", "澄迈", "临高", "白沙", "昌江", "乐东", "陵水", "保亭", "琼中", "秀英区", "龙华区", "琼山区", "美兰区", "海棠区", "吉阳区", "天涯区", "崖州区"],
    chongqing: ["重庆", "渝", "渝中区", "江北区", "南岸区", "九龙坡区", "沙坪坝区", "北碚区", "渝北区", "巴南区", "万州区", "涪陵区", "黔江区", "长寿区", "江津区", "合川区", "永川区", "南川区", "璧山区"],
    sichuan: ["四川", "成都", "自贡", "攀枝花", "泸州", "德阳", "绵阳", "广元", "遂宁", "内江", "乐山", "南充", "眉山", "宜宾", "广安", "达州", "雅安", "巴中", "资阳", "阿坝", "甘孜", "凉山", "九寨沟", "峨眉", "稻城", "锦江区", "青羊区", "金牛区", "武侯区", "成华区", "龙泉驿区", "青白江区", "新都区", "温江区", "双流区", "郫都区"],
    guizhou: ["贵州", "贵阳", "六盘水", "遵义", "安顺", "毕节", "铜仁", "黔西南", "黔东南", "黔南", "南明区", "云岩区", "花溪区", "乌当区", "白云区", "观山湖区", "钟山区", "水城区", "红花岗区", "汇川区", "播州区"],
    yunnan: ["云南", "昆明", "曲靖", "玉溪", "保山", "昭通", "丽江", "普洱", "临沧", "楚雄", "红河", "文山", "西双版纳", "大理", "德宏", "怒江", "迪庆", "五华区", "盘龙区", "官渡区", "西山区", "东川区", "呈贡区", "晋宁区", "麒麟区", "沾益区", "马龙区"],
    xizang: ["西藏", "拉萨", "日喀则", "昌都", "林芝", "山南", "那曲", "噶尔", "城关区", "堆龙德庆区", "达孜区"],
    shaanxi: ["陕西", "西安", "铜川", "宝鸡", "咸阳", "渭南", "延安", "汉中", "榆林", "安康", "商洛", "新城区", "碑林区", "莲湖区", "灞桥区", "未央区", "雁塔区", "阎良区", "临潼区", "长安区", "王益区", "印台区", "耀州区"],
    gansu: ["甘肃", "兰州", "嘉峪关", "金昌", "白银", "天水", "武威", "张掖", "平凉", "酒泉", "庆阳", "定西", "陇南", "临夏", "甘南", "敦煌", "鸣沙山", "月牙泉", "城关区", "七里河区", "西固区", "安宁区", "红古区", "秦州区", "麦积区"],
    qinghai: ["青海", "西宁", "海东", "海北", "黄南", "海南", "果洛", "玉树", "海西", "城东区", "城中区", "城西区", "城北区", "湟中区"],
    ningxia: ["宁夏", "银川", "石嘴山", "吴忠", "固原", "中卫", "兴庆区", "西夏区", "金凤区", "大武口区", "惠农区", "平罗县", "利通区", "红寺堡区", "青铜峡市", "原州区", "西吉县", "隆德县", "泾源县", "彭阳县", "沙坡头区", "中宁县", "海原县"],
    xinjiang: ["新疆", "乌鲁木齐", "克拉玛依", "吐鲁番", "哈密", "昌吉", "博尔塔拉", "巴音郭楞", "阿克苏", "克孜勒苏", "喀什", "和田", "伊犁", "塔城", "阿勒泰", "石河子", "阿拉尔", "图木舒克", "五家渠", "北屯", "铁门关", "双河", "可克达拉", "昆玉", "胡杨河", "天山区", "沙依巴克区", "新市区", "水磨沟区", "头屯河区", "达坂城区", "米东区"],
    hongkong: ["香港", "HK", "中西区", "湾仔区", "东区", "南区", "油尖旺区", "深水埗区", "九龙城区", "黄大仙区", "观塘区", "荃湾区", "屯门区", "元朗区", "北区", "大埔区", "西贡区", "沙田区", "葵青区", "离岛区"],
    macau: ["澳门", "MT", "花地玛堂区", "花王堂区", "望德堂区", "大堂区", "风顺堂区", "嘉模堂区", "路凼填海区", "圣方济各堂区"],
    taiwan: ["台湾", "台北", "高雄", "台中", "台南", "新北", "桃园", "基隆", "新竹", "嘉义", "宜兰", "新竹县", "苗栗", "彰化", "南投", "云林", "嘉义县", "屏东", "台东", "花莲", "澎湖", "金门", "连江", "垦丁", "阿里山", "日月潭", "中正区", "大同区", "中山区", "松山区", "大安区", "万华区", "信义区", "士林区", "北投区", "内湖区", "南港区", "文山区", "盐埕区", "鼓山区", "左营区", "楠梓区", "三民区", "新兴区", "前金区", "苓雅区", "旗津区", "前镇区", "三民区", "东区", "南区", "西区", "北区", "中区", "东区", "西区", "南区", "北区", "安平区", "中西区"],
  };

  for (const [provinceId, keywords] of Object.entries(provinceKeywords)) {
    if (keywords.some((kw) => location.includes(kw))) {
      return provinces.find((p) => p.id === provinceId);
    }
  }

  return undefined;
}

export const provinceImagePrompts: Record<string, string> = {
  beijing: "Forbidden City Beijing China grand imperial palace red walls golden roofs",
  shanghai: "Shanghai skyline Pudong night Oriental Pearl Tower modern skyscrapers",
  guangdong: "Guangzhou skyline Canton Tower Pearl River modern buildings",
  zhejiang: "West Lake Hangzhou China pagoda bridge cherry blossoms",
  jiangsu: "Suzhou classical Chinese garden canals stone bridges",
  sichuan: "Jiuzhaigou Valley Sichuan turquoise lakes snow mountains",
  yunnan: "Dali Yunnan Erhai Lake Cangshan Mountains sunset",
  xizang: "Potala Palace Lhasa Tibet golden roofs white walls",
  xinjiang: "Xinjiang grassland yurt snow mountains background",
  shandong: "Mount Tai Shandong sunrise sea of clouds",
  fujian: "Xiamen Gulangyu Island colonial buildings palm trees",
  hunan: "Zhangjiajie Hunan towering sandstone mountains",
  hubei: "Three Gorges Dam Hubei Yangtze River",
  anhui: "Yellow Mountain Anhui pine trees sea of clouds",
  henan: "Longmen Grottoes Luoyang Henan Buddhist statues",
  shaanxi: "Terracotta Warriors Xian Shaanxi ancient army",
  gansu: "Mogao Caves Dunhuang Gansu desert oasis",
  qinghai: "Qinghai Lake turquoise water rapeseed flower fields",
  heilongjiang: "Harbin ice festival illuminated ice sculptures night",
  jilin: "Changbai Mountain Jilin Tianchi lake snow",
  liaoning: "Dalian coastal city modern skyline sea",
  neimenggu: "Inner Mongolia grassland Mongolian yurts blue sky",
  ningxia: "Ningxia desert landscape Yellow River",
  hainan: "Sanya Hainan tropical beach palm trees clear water",
  guangxi: "Guilin Yangshuo Guangxi karst limestone mountains river",
  guizhou: "Guizhou waterfall lush green karst landscape",
  chongqing: "Chongqing skyline Yangtze River illuminated bridges",
  jiangxi: "Lushan Mountain Jiangxi misty peaks ancient villas",
  hongkong: "Hong Kong Victoria Harbour skyline night neon lights",
  macau: "Macau casino skyline Portuguese colonial architecture",
  taiwan: "Taiwan Taroko Gorge marble cliffs tropical forest",
  tianjin: "Tianjin coastal skyline Hai River",
  hebei: "Great Wall China Hebei mountains autumn",
  shanxi: "Pingyao ancient city Shanxi traditional architecture",
};

export function getProvinceImage(provinceId: string): string {
  const prompt =
    provinceImagePrompts[provinceId] ||
    `${provinceId} China travel landscape beautiful scenery`;
  const encodedPrompt = encodeURIComponent(prompt);
  return `https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=${encodedPrompt}&image_size=landscape_16_9`;
}
