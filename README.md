# 캠퍼스 신청 승인 서비스

웹서비스설계 과제 2의 신청 승인 서비스이다. 학생은 행사에 참가를 신청하고 본인의 대기 신청을 취소할 수 있으며, 담당 운영자는 정원 내에서 신청을 승인하거나 사유를 입력하여 승인을 취소할 수 있다. 승인 취소 시 같은 행사의 다음 대기자 한 명을 자동 승인하고, 모든 상태 변경과 변경 이력을 하나의 트랜잭션으로 저장한다.

- [보고서 PDF](docs/report.pdf): 업무 규칙, 상태 전이도, 승인 취소 시퀀스, 구현 설명과 검증 결과
- [API 명세](docs/API.md): 요청·응답, 상태, 오류 코드와 이력 필드
- [검증 캡처](docs/evidence/screenshots/): 자동 테스트와 화면 검증 증거

## 실행 환경

Node.js **24.x**가 필요하다. SQLite는 Node.js 내장 `node:sqlite`를 사용하므로 별도 DB 서버를 설치하지 않아도 된다.

| 항목 | 사용·검증 환경 |
| --- | --- |
| 운영 환경 | Windows, PowerShell |
| Node.js | v24.11.1 |
| npm | 11.6.2 |
| 서버 | Express 5.3.0 |
| 인증 | JWT, jsonwebtoken 9.0.3 |
| DB | SQLite, Node.js 내장 모듈 |
| 화면 | HTML, CSS, JavaScript |

## 설치와 실행

아래 명령은 `package.json`이 있는 프로젝트 루트에서 실행한다. Windows PowerShell에서는 실행 정책의 영향을 피하도록 `npm.cmd`를 사용한다. macOS와 Linux에서는 `npm.cmd` 대신 `npm`을 사용한다.

```powershell
node --version
npm.cmd --version
npm.cmd ci
npm.cmd start
```

브라우저에서 <http://127.0.0.1:3000>에 접속한다. 서버 종료는 실행 터미널에서 `Ctrl+C`로 진행한다.

첫 실행에서 기본 DB인 `data/app.sqlite`와 JWT 서명 키인 `data/jwt-secret.txt`가 자동 생성된다. 초기 데이터는 연습 계정 5개와 행사 2개이며, 신청과 변경 이력은 0건이다. 서버를 다시 실행해도 저장된 신청과 이력은 유지된다.

브라우저의 로그인 토큰은 탭의 메모리에 저장된다. 페이지를 새로고침하면 다시 로그인해야 한다. 다른 탭에서 변경한 결과는 화면의 **최신 정보 새로고침** 버튼으로 확인한다.

### 연습 계정과 행사

공통 비밀번호는 `Classroom123!`이다. 모두 과제용 가상 계정이다.

| 아이디 | 이름 | 역할 |
| --- | --- | --- |
| alice | 민지 | 학생 |
| bob | 준호 | 학생 |
| charlie | 서연 | 학생 |
| manager1 | 운영자 A | 행사 1 담당 |
| manager2 | 운영자 B | 행사 2 담당 |

| 행사 ID | 행사명 | 담당자 | 정원 |
| --- | --- | --- | --- |
| 1 | 함께 만드는 웹 서비스 | manager1 | 2명 |
| 2 | 서비스 설계 스터디 | manager2 | 1명 |

로그인 화면의 계정 버튼을 누르면 입력값이 채워진다. 학생과 운영자를 서로 다른 탭에서 로그인하여 신청과 승인 흐름을 확인할 수 있다.

### 선택 환경변수

기본 실행에는 `.env` 파일이나 환경변수 설정이 필요 없다.

| 변수 | 기본값·동작 |
| --- | --- |
| `PORT` | `3000`. 서버는 `127.0.0.1`에 바인딩한다. |
| `DB_PATH` | 프로젝트의 `data/app.sqlite`. 다른 SQLite 파일을 지정할 수 있다. |
| `JWT_SECRET` | 미설정 시 `data/jwt-secret.txt`를 생성하거나 재사용한다. 직접 지정할 때는 32자 이상이어야 한다. |

포트를 변경하려면 서버를 종료하고 다음과 같이 실행한다.

```powershell
$env:PORT = '3001'
npm.cmd start
```

기본 설정으로 돌아가려면 해당 PowerShell에서 설정을 해제한다.

```powershell
Remove-Item Env:PORT -ErrorAction SilentlyContinue
Remove-Item Env:DB_PATH -ErrorAction SilentlyContinue
```

## 구현 내용과 업무 규칙

| 기능 | 권한과 조건 | 상태·이력 |
| --- | --- | --- |
| 신청 `apply` | 학생만 가능. 행사 존재와 기존 신청 여부 검사 | 새 `PENDING` 신청과 `APPLY` 이력 저장 |
| 대기 취소 `cancel` | 신청한 학생 본인만 가능. 현재 상태가 `PENDING`이어야 함 | `CANCELLED`로 변경하고 `CANCEL` 이력 저장 |
| 직접 승인 `approve` | 행사 담당 운영자만 가능. `PENDING` 상태와 승인 정원 검사 | `APPROVED`로 변경하고 `APPROVE` 이력 저장 |
| 승인 취소 `revoke` | 행사 담당 운영자만 가능. 현재 상태가 `APPROVED`이어야 함 | `REVOKED`로 변경하고 사유를 포함한 `REVOKE` 이력 저장. 다음 대기자가 있으면 자동 승인 |

- 로그인한 사용자의 ID와 DB에 저장된 역할을 사용한다. 요청 본문으로 신원·역할·상태를 지정할 수 없다.
- 같은 학생은 같은 행사에 한 번만 신청할 수 있다. `CANCELLED`와 `REVOKED`도 기존 신청으로 처리하므로 재신청할 수 없다.
- 정원은 `APPROVED` 신청 수로 계산한다. 직접 승인 시 정원이 가득 차면 `409 CAPACITY_FULL`로 거부한다.
- 직접 승인은 운영자가 선택한 대기 신청을 대상으로 한다. 자동 승급에서는 같은 행사 `PENDING` 중 `created_at ASC, id ASC LIMIT 1`로 다음 한 명을 선택한다.
- 승인 취소 한 번에 최대 한 명만 승급한다. 대기자가 없으면 `promoted: null`을 반환하고 빈자리를 유지한다. 학생의 대기 취소는 자동 승급을 발생시키지 않는다.
- 승인 취소 사유는 앞뒤 공백을 제거한 뒤 JavaScript 문자열 길이 기준 5~200자여야 한다. 사유 외 추가 필드도 거부한다.
- 모든 성공한 변경에 신청 ID, 행위자, 전후 상태와 시각을 기록한다. 자동 승급 이력의 `causeHistoryId`는 원인인 `REVOKE` 이력 ID이며, 행위자는 승인 취소를 요청한 운영자이다.

### 트랜잭션 처리

`src/application-service.js`의 공통 `transaction` 함수가 `BEGIN IMMEDIATE`로 트랜잭션을 시작한 뒤 최신 DB 조회, 업무 규칙 검사, 상태 변경과 이력 저장을 수행한다. 모두 성공하면 `COMMIT`, 트랜잭션 내부에서 업무 규칙 위반이나 저장 오류가 발생하면 `ROLLBACK`한다.

승인 취소에서는 다음 작업 전체를 같은 트랜잭션으로 처리한다.

1. 대상 신청과 행사를 조회하고 담당자 권한 및 `APPROVED` 상태를 검사한다.
2. 기존 승인자를 `REVOKED`로 변경하고 `REVOKE` 이력을 저장한다.
3. 같은 행사의 다음 대기자 한 명을 조회한다.
4. 대기자가 있으면 `APPROVED`로 변경하고 원인 이력 ID와 함께 `AUTO_APPROVE` 이력을 저장한다.
5. 모든 작업이 성공한 경우에만 커밋한다.

이력 저장이 실패하면 앞서 수행한 상태 변경도 함께 롤백한다. 오래된 화면에서의 승인이나 반복 승인 취소는 서버가 조회한 현재 상태를 기준으로 거부하며 신청과 이력을 유지한다. 인증과 ID·본문 형식 검사는 API 계층에서 서비스 호출 전에 수행한다.

### 제공 코드와 추가 구현

로그인·JWT 인증, SQLite 스키마와 초기 데이터, 조회 API, 입력 형식·조회 권한 검사, 기본 화면, 저장·조회 보조 함수와 테스트는 제공 코드를 활용하였다.

| 변경 파일 | 추가·수정한 내용 |
| --- | --- |
| [src/application-service.js](src/application-service.js) | `apply`, `cancel`, `approve`, `revoke`의 업무 규칙, 상태 변경·이력 저장과 공통 트랜잭션 구현 |
| [src/repository.js](src/repository.js) | `nextPending`에 같은 행사·대기 상태 조건과 신청 시각·ID 순서에 따른 조회 SQL 구현 |
| [scripts/reset-db.js](scripts/reset-db.js) | Windows 한글 경로에서의 초기화 비정상 종료에 대응하여 파일 삭제를 `rmSync`에서 `unlinkSync`로 변경 |

## 자동 테스트와 검증 결과

기반 테스트와 화면·실행 재현 검증은 **2026년 11월 14일**, Windows PowerShell·Node.js v24.11.1·npm 11.6.2에서 과제 작성자가 직접 수행하였다. 필수 테스트는 **2026년 11월 15일** 다시 실행하여 32개 통과·실패 0개를 확인하고, T01부터 T32까지 모든 개별 결과를 UTF-8 로그로 저장하였다.

```powershell
npm.cmd test
npm.cmd run test:assignment
```

| 구분 | 최종 기록 | 증거 |
| --- | --- | --- |
| 기반 테스트 | 4개 통과, 실패 0개 | [기반 테스트 캡처](<docs/evidence/screenshots/기반 테스트.png>) |
| 필수 테스트 | 32개 통과, 실패 0개 | [전체 실행 로그: 11월 15일](docs/evidence/logs/assignment-final.txt), [통과 캡처: 11월 14일](docs/evidence/screenshots/필수테스트-32개통과.png) |
| T28 개별 재검사 | 신청 이력 저장 실패 시 신청까지 롤백, 1개 통과 | [T28 캡처](docs/evidence/screenshots/T28-롤백검증.png) |
| 선택 심화 동시성 | 미실행 | 서버 프로세스 2개의 마지막 자리 동시 승인 20회 검사는 수행하지 않음 |

자동 테스트는 별도의 임시 DB와 포트를 사용한다. T28부터 T30은 테스트 DB의 트리거로 이력 저장 실패를 주입하고, HTTP 500과 요청 전후 신청·이력 스냅샷의 동일성을 검사한다. 이때 출력되는 `TEST_INJECTED_FAILURE`는 의도적으로 주입한 오류이다. T29는 자동 승급 이력 저장 실패 시 두 신청의 상태와 이력 전체가 롤백되는지 검사하고, 트리거 제거 후 정상 재시도도 확인한다.

선택 심화 검사의 실행 명령은 다음과 같다.

```powershell
npm.cmd run test:advanced
```

최종 필수 테스트 증거는 [assignment-final.txt](docs/evidence/logs/assignment-final.txt)이다. 이 파일에는 한글 테스트명, T01부터 T32까지의 통과 결과, 총 32개 통과·실패 0개 요약이 모두 들어 있다.

증거 폴더에는 초기 실행과 재검사 기록도 함께 보관하였다. `필수 테스트.png`와 `docs/evidence/logs/base.txt`는 초기 실패 기록이다. `docs/evidence/logs/assignment.txt`에는 과거 32개 통과·실패 0개가 기록되어 있으나 한글이 깨진 부분이 있으므로, 최종 결과는 위 UTF-8 로그를 기준으로 확인한다.

## 화면 검증

자동 테스트와 별도로 브라우저에서 다음 흐름을 직접 조작하고 캡처하였다. T16·T31의 DB 재연결 검사와 U03의 실제 서버 프로세스 종료·재실행 검증을 구분하였다.

| ID | 검증 흐름과 결과 | 증거 |
| --- | --- | --- |
| U01 | alice 신청 → manager1 승인 → 학생 화면에서 `APPROVED`, 승인 인원 1/2명과 신청·승인 이력 확인 | [신청](docs/evidence/screenshots/U01-01-학생신청.png), [승인](docs/evidence/screenshots/U01-02-운영자승인.png), [학생 재조회](docs/evidence/screenshots/U01-03-학생승인확인.png) |
| U02 | bob이 대기 취소한 후 오래된 운영자 화면에서 승인 시도 → `409 INVALID_STATE`, `CANCELLED`와 승인 인원 1/2명 유지 | [기존 목록](docs/evidence/screenshots/U02-01-운영자대기목록.png), [대기 취소](docs/evidence/screenshots/U02-02-학생대기취소.png), [승인 거부](docs/evidence/screenshots/U02-03-오래된화면승인거부.png) |
| U03 | 서버 종료·재실행 후 재로그인 → 민지의 승인, 준호의 취소, 이력 4건과 승인 인원 유지 | [재시작 전](docs/evidence/screenshots/U03-01-재시작전.png), [서버 재실행](docs/evidence/screenshots/U03-02-서버재시작.png), [재시작 후](docs/evidence/screenshots/U03-03-재시작후.png) |
| U04 | 행사 2에서 alice 승인 취소 → bob 자동 승인, charlie 대기 유지, 승인 인원 1/1명 및 원인 이력 #5와 자동 승급 이력 #6의 연결 확인 | [취소 전](docs/evidence/screenshots/U04-01-승인취소전.png), [취소·승급](docs/evidence/screenshots/U04-02-승인취소와자동승급.png), [이력 연결](docs/evidence/screenshots/U04-03-변경이력연결.png) |
| U05 | 대기자 없이 alice 승인 취소 → `REVOKED`, 승인 인원 0/1명, `promoted: null`과 이력 3건 확인 | [취소 전](docs/evidence/screenshots/U05-01-승인취소전.png), [취소 결과](docs/evidence/screenshots/U05-02-대기자없는승인취소.png), [변경 이력](docs/evidence/screenshots/U05-03-변경이력.png) |

U01부터 U03은 기본 DB, U04와 U05는 `DB_PATH`로 지정한 새 DB를 각각 사용하였다. 검증 입력과 HTTP 응답, 상태·승인 인원·이력 비교의 상세 내용은 [보고서](docs/report.pdf)에 정리하였다.

## 새 폴더 설치·실행 재현

`node_modules`, 생성 DB와 서명 키를 제외하고 소스, 정적 화면, 실행·테스트 스크립트, 문서와 패키지·잠금 파일을 새 폴더로 복사하여 검증하였다. `DB_PATH` 설정을 해제한 뒤 `npm.cmd ci`로 설치하고 서버를 실행하였다.

새 DB에서 계정 5개·행사 2개·신청 0건·이력 0건을 확인하고, alice의 행사 1 신청이 HTTP 201·`PENDING`으로 저장되는지 확인하였다. 서버 종료 후 DB 초기화 완료 문구와 종료 코드 0, 초기화 후 신청·이력 0건도 확인하였다.

재현 절차와 결과는 보고서의 실행 재현 항목에 기록하였다. 재현 캡처 4개는 이 프로젝트의 `docs/evidence/screenshots/`에 함께 보관하였다.

| 증거 | 확인 내용 |
| --- | --- |
| [REPRO-01: 새 폴더 설치](docs/evidence/screenshots/REPRO-01-새폴더설치.png) | Node.js·npm 버전과 설치된 주요 패키지 |
| [REPRO-02: 서버 실행](docs/evidence/screenshots/REPRO-02-새폴더서버실행.png) | 새 폴더에서 서버 시작 |
| [REPRO-03: 신청](docs/evidence/screenshots/REPRO-03-새폴더신청.png) | HTTP 201과 PENDING 저장 |
| [REPRO-04: DB 초기화](docs/evidence/screenshots/REPRO-04-DB초기화.png) | 초기화 완료 문구와 종료 코드 0 |

## DB 초기화

서버를 먼저 종료한 뒤 다음 명령을 실행하고, 확인 문구에 대문자 `RESET`을 입력한다. 지정된 DB의 신청·변경 이력을 삭제하고 초기 계정과 행사를 다시 만든다.

```powershell
npm.cmd run db:reset
```

Windows PowerShell에서 정상 종료를 확인한 명령은 다음과 같다.

```powershell
'RESET' | npm.cmd run db:reset
$LASTEXITCODE
```

정상 완료 시 `초기화 완료. npm start로 실행하세요.`가 출력되고 종료 코드는 `0`이다. `DB_PATH`가 설정되어 있으면 해당 DB가 초기화 대상이므로, 출력되는 경로를 확인한다. 기본 DB를 대상으로 하려면 먼저 `Remove-Item Env:DB_PATH -ErrorAction SilentlyContinue`로 설정을 해제한다.

## 파일 구조

```text
src/
  application-service.js   업무 규칙·상태 변경·이력·트랜잭션
  repository.js            SQLite 조회·저장과 다음 대기자 선택
  db.js                    스키마와 초기 데이터
  auth.js                  로그인·JWT 인증
  app.js                   API·입력 검사·조회 권한·오류 응답
  server.js                로컬 서버 시작·종료
public/                    제공 화면
scripts/                   Node 버전 확인·DB 초기화
tests/                     기반·필수·선택 심화 테스트
docs/
  API.md                   API 명세
  report.pdf               보고서
  evidence/                검증 캡처와 실행 기록
package.json
package-lock.json
README.md
```

## 알려진 한계

- 선택 심화 동시성 테스트는 수행하지 않았다. `BEGIN IMMEDIATE`를 사용한 트랜잭션 구현과 서버 프로세스 2개의 동시 승인 검증 결과는 구분한다.
- 초기 자동 테스트에서 간헐적인 `listen EFAULT`가 발생하였다. 개별 및 전체 재실행에서 최종 통과를 확인했으나 기동 오류의 근본 원인은 확정하지 못하였다.
- Windows 한글 경로의 DB 초기화 비정상 종료는 파일 삭제를 `unlinkSync`로 변경한 뒤 새 폴더에서 정상 종료를 확인하였다. 실행 재현 기록은 위 Windows·Node.js 환경을 기준으로 한다.
- 제공 화면과 서버 시작 로그에는 초기 배포본의 구현 안내 문구가 남아 있다. 기능의 구현 상태는 실제 서비스 코드와 위 검증 결과를 기준으로 확인할 수 있다.

## AI 활용과 참고 자료

OpenAI Codex(GPT-6.1 Sol)를 업무 규칙·트랜잭션 코드, 대기자 조회 SQL, 초기화 오류 분석, 검증 절차 안내, 보고서·다이어그램·README 작성에 활용하였다. AI는 코드 문법 검사, DB 조회와 저장된 증거 검토도 지원하였다. 자동 테스트 실행, 브라우저 조작과 캡처는 과제 작성자가 직접 수행하였다.

- 구현 지원: `src/application-service.js`, `src/repository.js`, `scripts/reset-db.js`
- 문서 지원: 보고서 본문·다이어그램, 검증 절차와 이 README
- 검증 근거: 제공 테스트의 실행 결과, U01부터 U05의 화면 캡처, 새 폴더 설치·실행·초기화 기록

참고 자료는 과제 안내문, [제공 API 명세](docs/API.md), 제공 코드·테스트와 다음 문서이다.

- [Node.js 24 SQLite 문서](https://nodejs.org/docs/latest-v24.x/api/sqlite.html)
- [Express 5 API](https://expressjs.com/en/5x/api/)
- [jsonwebtoken](https://github.com/auth0/node-jsonwebtoken)
- [Node.js 이슈 #58759: Windows에서의 rmSync 문제](https://github.com/nodejs/node/issues/58759)
