# 秒薪桌宠

当前版本：1.1.0，桌宠为用户确认的“一二”白色角色，使用内置 SVG 重绘，包含呼吸与眨眼动画。

一个本地运行的 Windows 桌宠：填写税后月薪和作息后，鼠标移到一二上即可看到当天已赚金额、秒薪和下班倒计时。

## 运行

需要 Node.js 22 或更高版本。

```powershell
npm install
npm start
```

首次启动会打开设置窗口。填写扣除个税和个人承担的五险一金后的实际到账固定月薪，选择工作日、上下班时间和午休。设置保存在本机，不会联网上传。

鼠标移到一二上展开收入卡片；移到卡片上可以继续查看；离开后卡片自动收起。左键拖动一二，右键打开设置和退出菜单。

## 验证与打包

```powershell
npm test
npm run typecheck
npm run build
npm run test:desktop
npm run package
```

`npm run package` 会生成 `../release/SalaryPet-win32-x64/SalaryPet.exe`。打包版本首次启动也会从空设置开始。

## 计算口径

秒薪 = 税后月薪 ÷ 当月所有排定工作日的有效工作总秒数；午休不计入。应用按当前本地时间重新计算，不会把每秒四舍五入后的显示值累加。它是收入展示估算，不是考勤或工资结算。

## 角色参考

根据用户指定的“一二布布”角色和确认的白色“一二”形象绘制，参考图：https://c-ssl.duitang.com/uploads/blog/202112/31/20211231082620_b6122.jpg 。角色显示资源内置，运行时不从网络加载图片。

将 `SALARY_PET_PACKAGE_OUT` 设置为 `../release-yier` 可将新版打包到独立文件夹；不设置时默认使用 `../release`。
