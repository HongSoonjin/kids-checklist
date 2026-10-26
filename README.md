# 이거사줘

자녀가 필요한 준비물을 등록하면 부모가 확인·완료·보류로 답해주는 가족용 앱 (React + Vite + Firebase, GitHub Pages 배포).

## 로컬 실행
1. `npm install`
2. `.env.example`을 복사해 `.env` 만들고 Firebase 설정값 6개 입력
3. `npm run dev`

## Firebase 설정
- Authentication: 이메일/비밀번호 사용 설정
- Firestore: `config` 컬렉션 → 문서 ID `invite` → 필드 `parentCode`(문자열), `childCode`(문자열) 직접 생성
- 보안 규칙 배포: `firebase login` → `firebase use --add` → `firebase deploy --only firestore:rules`

## GitHub 배포
- 저장소 Settings → Secrets and variables → Actions에 `VITE_FIREBASE_*` 6개 등록
- Settings → Pages → Source: GitHub Actions
- main 브랜치에 push하면 자동 배포: https://hongsoonjin.github.io/kids-checklist/
