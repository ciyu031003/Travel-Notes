import re, shutil, datetime
p='/home/ubuntu/travel-notes/.env'
shutil.copy2(p, p+'.bak-'+datetime.datetime.now().strftime('%Y%m%d-%H%M%S'))
s=open(p,encoding='utf-8').read()
def setk(k,v):
    global s
    if re.search(r'(?m)^'+re.escape(k)+r'=.*$', s):
        s=re.sub(r'(?m)^'+re.escape(k)+r'=.*$', lambda m: k+'='+v, s, count=1)
    else:
        if not s.endswith('\n'): s+='\n'
        s+=k+'='+v+'\n'
setk('APP_VERSION','1.26.0')
setk('APP_BUILD_NUMBER','57')
setk('APP_APK_SHA256','46a6bf934f6cd21f77f0705ad26fbc8a0a8bbda00bf8996d0b6f57b514da717c')
setk('APP_APK_SIZE','15306490')
setk('APP_MIN_SUPPORTED_BUILD','55')
setk('APP_CHANGELOG',"'Next 16/React 19.3/ESLint 10 升级；存量库迁移自动修复；多副本 Redis 准备；a11y axe 全绿；真机静态验证'")
open(p,'w',encoding='utf-8').write(s)
print('env updated')
