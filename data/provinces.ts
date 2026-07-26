export interface Province {
  id: string;
  adcode: number;
  name: string;
  nameEn: string;
}

export const provinces: Province[] = [
  { id: "beijing", adcode: 110000, name: "北京", nameEn: "Beijing" },
  { id: "tianjin", adcode: 120000, name: "天津", nameEn: "Tianjin" },
  { id: "hebei", adcode: 130000, name: "河北", nameEn: "Hebei" },
  { id: "shanxi", adcode: 140000, name: "山西", nameEn: "Shanxi" },
  { id: "neimenggu", adcode: 150000, name: "内蒙古", nameEn: "Inner Mongolia" },
  { id: "liaoning", adcode: 210000, name: "辽宁", nameEn: "Liaoning" },
  { id: "jilin", adcode: 220000, name: "吉林", nameEn: "Jilin" },
  { id: "heilongjiang", adcode: 230000, name: "黑龙江", nameEn: "Heilongjiang" },
  { id: "shanghai", adcode: 310000, name: "上海", nameEn: "Shanghai" },
  { id: "jiangsu", adcode: 320000, name: "江苏", nameEn: "Jiangsu" },
  { id: "zhejiang", adcode: 330000, name: "浙江", nameEn: "Zhejiang" },
  { id: "anhui", adcode: 340000, name: "安徽", nameEn: "Anhui" },
  { id: "fujian", adcode: 350000, name: "福建", nameEn: "Fujian" },
  { id: "jiangxi", adcode: 360000, name: "江西", nameEn: "Jiangxi" },
  { id: "shandong", adcode: 370000, name: "山东", nameEn: "Shandong" },
  { id: "henan", adcode: 410000, name: "河南", nameEn: "Henan" },
  { id: "hubei", adcode: 420000, name: "湖北", nameEn: "Hubei" },
  { id: "hunan", adcode: 430000, name: "湖南", nameEn: "Hunan" },
  { id: "guangdong", adcode: 440000, name: "广东", nameEn: "Guangdong" },
  { id: "guangxi", adcode: 450000, name: "广西", nameEn: "Guangxi" },
  { id: "hainan", adcode: 460000, name: "海南", nameEn: "Hainan" },
  { id: "chongqing", adcode: 500000, name: "重庆", nameEn: "Chongqing" },
  { id: "sichuan", adcode: 510000, name: "四川", nameEn: "Sichuan" },
  { id: "guizhou", adcode: 520000, name: "贵州", nameEn: "Guizhou" },
  { id: "yunnan", adcode: 530000, name: "云南", nameEn: "Yunnan" },
  { id: "xizang", adcode: 540000, name: "西藏", nameEn: "Tibet" },
  { id: "shaanxi", adcode: 610000, name: "陕西", nameEn: "Shaanxi" },
  { id: "gansu", adcode: 620000, name: "甘肃", nameEn: "Gansu" },
  { id: "qinghai", adcode: 630000, name: "青海", nameEn: "Qinghai" },
  { id: "ningxia", adcode: 640000, name: "宁夏", nameEn: "Ningxia" },
  { id: "xinjiang", adcode: 650000, name: "新疆", nameEn: "Xinjiang" },
  { id: "taiwan", adcode: 710000, name: "台湾", nameEn: "Taiwan" },
  { id: "hongkong", adcode: 810000, name: "香港", nameEn: "Hong Kong" },
  { id: "macau", adcode: 820000, name: "澳门", nameEn: "Macau" },
];

export const TOTAL_PROVINCES = provinces.length;

export const getProvince = (id: string): Province | undefined =>
  provinces.find((province) => province.id === id);

export const getProvinceByAdcode = (adcode: number): Province | undefined =>
  provinces.find((province) => province.adcode === adcode);
