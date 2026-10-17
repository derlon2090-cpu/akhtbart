# تطبيق مسابقة عباقرة الكيمياء على Android

التطبيق يعرض اختبار الطلاب من الرابط الرسمي داخل Android WebView ويضبط `FLAG_SECURE` على نافذة التطبيق لمنع تصويرها أو تسجيلها بأدوات النظام المدعومة في Android.

## تثبيت نسخة Android

حمّل `downloads/chemistry-geniuses-android.apk` وثبّته على جهاز Android. قد يطلب النظام السماح بالتثبيت من مصدر الملف.

**مهم:** حماية `FLAG_SECURE` تنطبق عند فتح الاختبار من هذا التطبيق فقط. فتح رابط الموقع مباشرةً في Chrome أو متصفح آخر لا يفعّلها.

## البناء من المصدر

يتطلب Android Studio أو Android SDK، وJDK 17 أو أحدث.

```powershell
cd android-app
./gradlew assembleDebug
```

الناتج: `android-app/app/build/outputs/apk/debug/app-debug.apk`.
