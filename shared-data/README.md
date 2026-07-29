# Shared data

Google Drive에서 받은 최신 표준화 Excel 파일을 이 폴더에 아래 이름으로 둡니다.

```text
shared-data/standardized-data.xlsx
shared-data/scenario-data.xlsx
```

파일을 교체한 뒤 프로젝트 루트에서 다음 명령을 실행하면 서비스용 JSON과 D1 초기
데이터가 함께 갱신됩니다.

```bash
pnpm data:build
pnpm scenario:build
pnpm test
```

다른 위치의 Excel을 사용하려면 경로를 직접 전달할 수 있습니다.

```bash
pnpm data:build -- "/absolute/path/to/data.xlsx"
pnpm scenario:build -- "/absolute/path/to/scenario.xlsx"
```

Excel은 바이너리 파일이라 동시에 수정하면 병합할 수 없습니다. 한 번에 한 명만
수정하고, 업로드 전에 기존 파일을 날짜가 포함된 이름으로 백업하세요.
