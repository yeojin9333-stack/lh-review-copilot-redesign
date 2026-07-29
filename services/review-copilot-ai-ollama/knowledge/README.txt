초기 배포와 함께 등록할 CSV 및 지식 문서는 inbox 폴더에 넣으세요.

예시:
knowledge/inbox/lh_design_standard.csv
knowledge/inbox/past_ve_cases.csv

그다음 프로젝트 루트에서 운영체제에 맞게 실행:

macOS:
./scripts/start_ollama_mac.sh

Windows PowerShell:
.\scripts\start_ollama_windows.ps1

이미 서버가 실행 중이면:

macOS:
./scripts/upload_inbox.sh --project-id mvp-ramp

Windows PowerShell:
.\scripts\upload_inbox.ps1 -ProjectId mvp-ramp

주의:
- inbox의 실제 파일은 Git에 커밋되지 않도록 제외되어 있습니다.
- 프로토타입 사용자가 화면에서 선택하는 CSV는 inbox에 복사할 필요가 없습니다.
- 화면 업로드 파일은 /api/v1/knowledge/documents로 바로 전송하세요.
