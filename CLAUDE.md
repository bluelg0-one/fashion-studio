# 새 컴퓨터에서 Claude Code 설정

사용자는 여러 컴퓨터를 옮겨 다니며 작업한다. 새 컴퓨터 설정이나 플러그인 설치를 물으면 아래 절차를 안내할 것.

## 1. 준비 (Windows PowerShell)

- Python 3 확인: `python --version` → 없으면 https://www.python.org/downloads/ ("Add Python to PATH" 체크)
- Git 설치: `winget install --id Git.Git -e` → PowerShell 재시작 후 `git --version`
- Claude Code 설치: `irm https://claude.ai/install.ps1 | iex` → PowerShell 재시작 후 `claude --version`
  - `claude`를 못 찾으면: `[Environment]::SetEnvironmentVariable("Path", [Environment]::GetEnvironmentVariable("Path","User") + ";$env:USERPROFILE\.local\bin", "User")` 후 재시작

## 2. 플러그인 설치 (`claude` 실행 후 Claude Code 안에서, 범위는 user scope)

```
/plugin marketplace add anthropics/claude-plugins-official
/plugin install mattpocock-skills@claude-plugins-official
/plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill
/plugin install ui-ux-pro-max@ui-ux-pro-max-skill
```

설치 후 `/exit` → `claude` 재실행. ponytail은 claude.ai 계정 플러그인이라 로그인하면 동기화된다(안 보이면 claude.ai 플러그인 설정에서 켜기).

## 3. 클라우드 환경

클라우드 환경의 설정 스크립트(환경 편집 → 설정 스크립트)에 아래가 있어야 세션마다 자동 설치된다. fashion-studio 환경에는 이미 있음.

```bash
claude plugin marketplace add anthropics/claude-plugins-official || true
claude plugin install mattpocock-skills@claude-plugins-official || true
claude plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill || true
claude plugin install ui-ux-pro-max@ui-ux-pro-max-skill || true
```
