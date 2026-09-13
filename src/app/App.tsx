import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpDown,
  Bell,
  BookOpen,
  CalendarPlus,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardPenLine,
  Cloud,
  Download,
  Database,
  Eye,
  EyeOff,
  FileSpreadsheet,
  HeartHandshake,
  KeyRound,
  LayoutDashboard,
  LoaderCircle,
  LogIn,
  LogOut,
  Menu,
  Plus,
  Pencil,
  RotateCcw,
  Save,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  UserRound,
  UsersRound,
  Trash2,
  Upload,
  WifiOff,
  X,
} from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import { usePwa } from "../hooks/usePwa";
import {
  api,
  downloadCloudBackup,
  getAppMode,
  purgeCloudData,
  setAppMode,
  uploadBackupToCloud,
} from "../lib/api";
import type { AppMode, CurrentUser } from "../lib/api";
import { koreanHolidays } from "../lib/koreanHolidays";
import { importLocalBackup, localBackup } from "../lib/localDb";
import { maskStudentName, studentLabel } from "../lib/privacy";
import { downloadStudentCounselingExcel } from "../lib/studentCounselingExport";
import { parseStudentSheet } from "../lib/studentImport";
import type { ParsedStudentRow } from "../lib/studentImport";

const navigation = [
  { label: "홈", to: "/", icon: LayoutDashboard },
  { label: "학생", to: "/students", icon: UsersRound },
  { label: "상담", to: "/counseling", icon: ClipboardPenLine },
  { label: "일정", to: "/calendar", icon: CalendarDays },
  { label: "검색", to: "/reports", icon: Search },
];

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-10 place-items-center rounded-lg bg-mint-500 text-white">
        <HeartHandshake size={23} strokeWidth={2.4} aria-hidden="true" />
      </span>
      <div>
        <p className="text-[17px] font-extrabold leading-5 text-ink">
          마음잇기
        </p>
        <p className="text-xs font-medium text-gray-500">학생상담관리</p>
      </div>
    </div>
  );
}

function Sidebar({
  open,
  close,
  user,
  logout,
  openGuide,
}: {
  open: boolean;
  close: () => void;
  user: CurrentUser;
  logout: () => void;
  openGuide: () => void;
}) {
  return (
    <>
      {open && (
        <button
          className="fixed inset-0 z-30 bg-black/30 lg:hidden"
          onClick={close}
          aria-label="메뉴 닫기"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-gray-200 bg-white px-4 py-6 transition-transform lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex items-center justify-between px-2">
          <Brand />
          <button
            className="grid size-9 place-items-center rounded-md text-gray-500 hover:bg-gray-100 lg:hidden"
            onClick={close}
            title="메뉴 닫기"
          >
            <X size={20} />
          </button>
        </div>
        <nav className="mt-9 space-y-1" aria-label="주 메뉴">
          {navigation.map(({ label, to, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={close}
              className={({ isActive }) =>
                `flex h-12 items-center gap-3 rounded-lg px-3 text-[15px] font-bold transition-colors ${isActive ? "bg-mint-50 text-mint-700" : "text-gray-600 hover:bg-gray-50 hover:text-ink"}`
              }
            >
              <Icon size={20} strokeWidth={2.2} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto border-t border-gray-100 pt-4">
          <button
            onClick={() => {
              openGuide();
              close();
            }}
            className="flex h-11 w-full items-center gap-3 rounded-lg px-3 text-sm font-bold text-gray-600 hover:bg-gray-50"
          >
            <BookOpen size={19} /> 사용설명서
          </button>
          <NavLink
            to="/settings"
            onClick={close}
            className="flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-bold text-gray-600 hover:bg-gray-50"
          >
            <Settings size={19} /> 설정
          </NavLink>
          <div className="mt-3 flex items-center gap-3 px-3 py-2">
            <span className="grid size-9 place-items-center rounded-full bg-gray-100 text-gray-600">
              <UserRound size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">
                {user.name ?? "관리자"}
              </p>
              <p className="truncate text-xs text-gray-500">
                {user.workspace.name}
              </p>
            </div>
            <button
              onClick={logout}
              className="grid size-9 place-items-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              title="로그아웃"
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

function UserGuide({ close }: { close: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="user-guide-title"
    >
      <div className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-lg bg-white sm:rounded-lg">
        <div className="sticky top-0 flex items-center justify-between border-b border-gray-100 bg-white px-5 py-4 sm:px-7">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-lg bg-mint-50 text-mint-700">
              <BookOpen size={20} />
            </span>
            <div>
              <p className="text-xs font-extrabold text-mint-700">마음잇기</p>
              <h2 id="user-guide-title" className="font-extrabold">
                사용설명서
              </h2>
            </div>
          </div>
          <button
            onClick={close}
            className="grid size-10 place-items-center rounded-md text-gray-500 hover:bg-gray-100"
            title="닫기"
          >
            <X size={20} />
          </button>
        </div>
        <div className="divide-y divide-gray-100 px-5 sm:px-7">
          <section className="py-5">
            <h3 className="font-extrabold">1. 학생 찾기와 등록</h3>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              학생 메뉴에서 이름 또는 학번으로 찾습니다. 학번은 학년 1자리, 반 2자리, 번호 2자리 순서입니다. 예를 들어 1학년 3반 2번은 10302로 검색합니다.
            </p>
          </section>
          <section className="py-5">
            <h3 className="font-extrabold">2. 상담 기록</h3>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              빠른 상담에서 학생과 상담 유형을 선택하고 한줄 기록을 저장합니다. 상세 내용과 후속상담일은 필요한 경우에만 입력하면 됩니다.
            </p>
          </section>
          <section className="py-5">
            <h3 className="font-extrabold">3. 후속상담과 일정</h3>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              대시보드의 후속상담 목록은 아직 완료되지 않은 모든 후속 기록을 기한순으로 보여 줍니다. 일정 메뉴에서는 월간 달력과 목록으로 예정 상담을 관리합니다.
            </p>
          </section>
          <section className="py-5">
            <h3 className="font-extrabold">4. 여러 학생 정리</h3>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              학생 목록의 체크박스로 여러 명을 선택한 뒤 휴지통으로 이동할 수 있습니다. 영구삭제가 아니므로 설정의 휴지통에서 복원할 수 있습니다.
            </p>
          </section>
          <section className="py-5">
            <h3 className="font-extrabold">5. 백업과 데이터 모드</h3>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              설정에서 JSON 백업을 정기적으로 받아 두세요. 클라우드 자료를 로컬 모드로 옮길 때는 백업 다운로드와 확인이 끝난 뒤에만 클라우드 자료를 삭제할 수 있습니다.
            </p>
          </section>
          <section className="py-5">
            <h3 className="font-extrabold">6. 개인정보 보호</h3>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              화면에는 학생 이름이 가려져 표시됩니다. 내보내기 자료와 백업 파일에는 상담 정보가 포함될 수 있으니 학교의 보관 기준에 따라 관리하세요.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

function LoginScreen({
  onSuccess,
  startLocal,
  startCloud,
  mode,
  pwa,
}: {
  onSuccess: () => void;
  startLocal: () => void;
  startCloud: () => void;
  mode: AppMode;
  pwa: ReturnType<typeof usePwa>;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const login = useMutation({
    mutationFn: () => api.login(mode === "local" ? "local" : username, password),
    onSuccess,
  });

  return (
    <main className="grid min-h-[100dvh] bg-white lg:grid-cols-[minmax(0,1fr)_460px]">
      <div className="flex min-h-[34dvh] items-center justify-center overflow-hidden bg-[#00D2D1] lg:min-h-[100dvh]">
        <img
          src="/access-hero.png"
          alt="학생과 교사가 밝게 상담하는 마음잇기 소개 이미지"
          className="block h-auto max-h-[100dvh] w-full object-contain"
        />
      </div>
      <div className="flex items-center justify-center border-t border-gray-200 bg-white px-5 py-8 sm:px-10 lg:border-l lg:border-t-0">
        <section className="w-full max-w-[380px]">
          <Brand />
          <div className="mt-7">
            <div className="flex items-center gap-2 text-sm font-extrabold text-mint-700">
              <ShieldCheck size={18} /> {mode === "local" ? "이 기기 로컬 모드" : "관리자 전용"}
            </div>
            <h1 className="mt-2 text-2xl font-extrabold text-ink">
              {mode === "local" ? "로컬 데이터를 잠금 해제하세요" : "상담 업무를 시작하세요"}
            </h1>
            <p className="mt-2 text-sm leading-6 text-gray-500">
              {mode === "local"
                ? "이 기기에 저장된 상담 기록을 보려면 관리자 비밀번호를 입력하세요."
                : "안전하게 로그인하고 학생의 상담 기록을 관리하세요."}
            </p>
          </div>
          <form
            className="mt-7 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              login.mutate();
            }}
          >
            {mode === "cloud" && <label className="block">
              <span className="mb-2 block text-sm font-bold text-gray-700">
                관리자 아이디
              </span>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                required
                maxLength={100}
                className="h-12 w-full rounded-md border border-gray-300 bg-white px-4 text-sm outline-none transition focus:border-mint-500 focus:ring-3 focus:ring-mint-100"
                placeholder="아이디를 입력하세요"
              />
            </label>}
            <label className="block">
              <span className="mb-2 block text-sm font-bold text-gray-700">
                비밀번호
              </span>
              <span className="relative block">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                  minLength={4}
                  maxLength={256}
                  className="h-12 w-full rounded-md border border-gray-300 bg-white px-4 pr-12 text-sm outline-none transition focus:border-mint-500 focus:ring-3 focus:ring-mint-100"
                  placeholder="비밀번호를 입력하세요"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute right-1.5 top-1.5 grid size-9 place-items-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                  title={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </span>
            </label>
            {mode === "local" && (
              <p className="text-xs text-gray-400">
                임시 비밀번호:{" "}
                <span className="font-bold text-gray-500">1234</span>
              </p>
            )}
            {login.isError && (
              <p
                role="alert"
                className="rounded-md bg-rose-50 px-3 py-2.5 text-sm font-semibold text-rose-700"
              >
                {login.error.message}
              </p>
            )}
            <button
              type="submit"
              disabled={login.isPending}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-md bg-mint-600 text-sm font-extrabold text-white hover:bg-mint-700 disabled:cursor-wait disabled:opacity-60"
            >
              {login.isPending ? (
                <LoaderCircle size={19} className="animate-spin" />
              ) : (
                <LogIn size={19} />
              )}{" "}
              {mode === "local" ? "로컬 모드 잠금 해제" : "로그인"}
            </button>
          </form>
          {(pwa.needRefresh || pwa.canInstall) && (
            <button
              type="button"
              onClick={pwa.needRefresh ? pwa.update : pwa.install}
              className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-md border border-mint-200 text-sm font-extrabold text-mint-700 hover:bg-mint-50"
            >
              {pwa.needRefresh ? <RotateCcw size={18} /> : <Download size={18} />}
              {pwa.needRefresh ? "새 버전으로 업데이트" : "이 기기에 앱 설치"}
            </button>
          )}
          {pwa.showIosInstallHint && !pwa.canInstall && !pwa.needRefresh && (
            <div className="mt-3 rounded-md border border-mint-200 bg-mint-50 px-4 py-3">
              <p className="flex items-center gap-1.5 text-xs font-bold text-mint-800">
                <Download size={14} />
                홈 화면에 앱으로 설치하기
              </p>
              <p className="mt-1.5 text-xs leading-5 text-mint-700">
                Safari 하단의 <span className="font-bold">공유 버튼(□↑)</span>을 탭한 뒤
                {" "}<span className="font-bold">홈 화면에 추가</span>를 선택하세요.
              </p>
            </div>
          )}
          {mode === "cloud" ? (
            <button
              type="button"
              onClick={startLocal}
              className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-md border border-mint-200 text-sm font-extrabold text-mint-700 hover:bg-mint-50"
            >
              <Database size={18} /> 로컬 모드로 시작
            </button>
          ) : (
            <button
              type="button"
              onClick={startCloud}
              className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-md border border-mint-200 text-sm font-extrabold text-mint-700 hover:bg-mint-50"
            >
              <ShieldCheck size={18} /> DB 모드로 돌아가기
            </button>
          )}
          <p className="mt-5 text-center text-xs text-gray-500">
            상담 정보 보호를 위해 공용 기기에서는 사용 후 로그아웃하세요.
          </p>
        </section>
      </div>
    </main>
  );
}

function StatCard({
  label,
  value,
  unit,
  tone,
}: {
  label: string;
  value: number;
  unit: string;
  tone: "mint" | "yellow" | "blue" | "coral";
}) {
  const tones = {
    mint: "bg-mint-50 text-mint-700",
    yellow: "bg-amber-50 text-amber-700",
    blue: "bg-sky-50 text-sky-700",
    coral: "bg-rose-50 text-rose-700",
  };
  return (
    <div className="lift rounded-lg border border-gray-200 bg-white p-5 shadow-panel">
      <div
        className={`mb-5 h-1.5 w-9 rounded-full ${tones[tone].split(" ")[0]}`}
      />
      <p className="text-sm font-semibold text-gray-500">{label}</p>
      <p className="mt-2 flex items-baseline gap-1 text-3xl font-extrabold text-ink">
        {value}
        <span className="text-sm font-bold text-gray-500">{unit}</span>
      </p>
    </div>
  );
}

function EmptyList({ type }: { type: "today" | "followup" }) {
  const isToday = type === "today";
  return (
    <div className="flex min-h-48 flex-col items-center justify-center px-5 py-8 text-center">
      <span
        className={`grid size-12 place-items-center rounded-full ${isToday ? "bg-sky-50 text-sky-600" : "bg-mint-50 text-mint-600"}`}
      >
        {isToday ? <CalendarDays size={23} /> : <Check size={23} />}
      </span>
      <p className="mt-4 text-sm font-bold text-gray-700">
        {isToday ? "오늘 예정된 상담이 없어요" : "놓친 후속상담이 없어요"}
      </p>
      <p className="mt-1 text-xs text-gray-500">
        {isToday
          ? "새 일정을 등록하면 여기에 표시됩니다."
          : "후속상담 일정이 생기면 알려드릴게요."}
      </p>
    </div>
  );
}

function Dashboard({
  openQuickCounseling,
  pwa,
}: {
  openQuickCounseling: () => void;
  pwa: ReturnType<typeof usePwa>;
}) {
  const health = useQuery({
    queryKey: ["health"],
    queryFn: api.health,
    refetchInterval: 60_000,
  });
  const dashboard = useQuery({
    queryKey: ["dashboard"],
    queryFn: api.dashboard,
  });
  const stats = dashboard.data?.stats ?? {
    students: 0,
    thisWeekCounseling: 0,
    todayCounseling: 0,
    followUpRequired: 0,
  };

  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-10 lg:pt-8">
      {(pwa.needRefresh || pwa.canInstall) && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-mint-100 bg-mint-50 px-4 py-3 text-sm">
          <div className="flex items-center gap-2 font-bold text-mint-700">
            <Download size={18} />
            {pwa.needRefresh
              ? "새 버전을 사용할 수 있어요."
              : "이 기기에 앱을 설치할 수 있어요."}
          </div>
          <button
            onClick={pwa.needRefresh ? pwa.update : pwa.install}
            className="rounded-md bg-mint-600 px-4 py-2 font-bold text-white hover:bg-mint-700"
          >
            {pwa.needRefresh ? "업데이트" : "설치"}
          </button>
        </div>
      )}

      <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-bold text-mint-700">2026학년도</p>
          <h1 className="mt-1 text-[28px] font-extrabold leading-tight text-ink sm:text-[32px]">
            오늘도 학생의 마음을 이어주세요
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            9월 13일 일요일, 상담 업무를 한눈에 확인하세요.
          </p>
        </div>
        <button
          onClick={openQuickCounseling}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-mint-500 px-5 text-sm font-extrabold text-white shadow-sm hover:bg-mint-600"
        >
          <Sparkles size={19} /> 빠른 상담
        </button>
      </header>

      <section
        className="mt-7 grid grid-cols-2 gap-3 xl:grid-cols-4"
        aria-label="업무 현황"
      >
        <StatCard
          label="전체 학생"
          value={stats.students}
          unit="명"
          tone="mint"
        />
        <StatCard
          label="이번 주 상담"
          value={stats.thisWeekCounseling}
          unit="건"
          tone="blue"
        />
        <StatCard
          label="오늘 상담"
          value={stats.todayCounseling}
          unit="건"
          tone="yellow"
        />
        <StatCard
          label="후속상담 필요"
          value={stats.followUpRequired}
          unit="건"
          tone="coral"
        />
      </section>

      <section className="mt-6 grid gap-5 xl:grid-cols-[1.45fr_1fr]">
        <div className="rounded-lg border border-gray-200 bg-white shadow-panel">
          <div className="flex h-16 items-center justify-between border-b border-gray-100 px-5">
            <div className="flex items-center gap-2">
              <CalendarDays size={19} className="text-sky-600" />
              <h2 className="font-extrabold">오늘 상담</h2>
            </div>
            <button className="flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-ink">
              전체 보기 <ChevronRight size={16} />
            </button>
          </div>
          {!dashboard.data?.todayCounseling.length ? (
            <EmptyList type="today" />
          ) : (
            <ul className="divide-y divide-gray-100">
              {dashboard.data.todayCounseling.map((item) => (
                <li key={item.id} className="flex items-center gap-4 px-5 py-4">
                  <time className="w-12 text-sm font-extrabold text-sky-700">
                    {item.counseling_time ?? "기록"}
                  </time>
                  <div>
                    <p className="text-sm font-extrabold">
                      {maskStudentName(item.student_name)}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      {item.summary || "상담 기록"}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-lg border border-gray-200 bg-white shadow-panel">
          <div className="flex h-16 items-center justify-between border-b border-gray-100 px-5">
            <div className="flex items-center gap-2">
              <Bell size={19} className="text-rose-500" />
              <h2 className="font-extrabold">후속상담</h2>
            </div>
            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-bold text-gray-500">
              {dashboard.data?.followUps.length ?? 0}
              건
            </span>
          </div>
          {!dashboard.data?.followUps.length ? (
            <EmptyList type="followup" />
          ) : (
            <ul className="divide-y divide-gray-100">
              {(dashboard.data?.followUps ?? []).map((item) => (
                <li key={item.id} className="px-5 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-extrabold">
                      {maskStudentName(item.student_name)}
                    </p>
                    <time className="text-xs font-bold text-rose-600">
                      {item.follow_up_date}
                    </time>
                  </div>
                  <p className="mt-1 truncate text-xs text-gray-500">
                    {item.summary}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-gray-200 bg-white p-5 shadow-panel">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <span
              className={`grid size-10 place-items-center rounded-lg ${health.isSuccess && health.data.database === "ok" ? "bg-mint-50 text-mint-600" : "bg-gray-100 text-gray-500"}`}
            >
              {health.isError ? <WifiOff size={20} /> : <Cloud size={20} />}
            </span>
            <div>
              <h2 className="text-sm font-extrabold">클라우드 연결</h2>
              <p className="mt-0.5 text-xs text-gray-500">
                {health.isPending
                  ? "연결 상태를 확인하고 있어요."
                  : health.isSuccess
                    ? `${health.data.environment === "local" ? "로컬 개발 DB" : health.data.environment === "preview" ? "미리보기 DB" : "클라우드 운영 DB"} · API v${health.data.appVersion}`
                    : "개발 서버가 아직 연결되지 않았어요."}
              </p>
            </div>
          </div>
          <span
            className={`w-fit rounded-full px-3 py-1.5 text-xs font-extrabold ${health.isSuccess && health.data.database === "ok" ? "bg-mint-50 text-mint-700" : "bg-gray-100 text-gray-500"}`}
          >
            {health.isSuccess && health.data.database === "ok"
              ? "정상 작동 중"
              : "연결 대기"}
          </span>
        </div>
      </section>
    </div>
  );
}

const statusLabels: Record<string, string> = {
  normal: "일반",
  monitoring: "관찰",
  follow_up: "후속상담 필요",
  in_progress: "진행 중",
  completed: "완료",
};

function CounselingPage({
  openQuickCounseling,
}: {
  openQuickCounseling: () => void;
}) {
  const queryClient = useQueryClient();
  const records = useQuery({
    queryKey: ["counseling"],
    queryFn: api.counseling,
  });
  const [selected, setSelected] = useState<
    import("../lib/api").CounselingSummary | null
  >(null);
  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-10 lg:pt-8">
      <header className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-mint-700">누적 상담</p>
          <h1 className="mt-1 text-3xl font-extrabold">상담 기록</h1>
        </div>
        <button
          onClick={openQuickCounseling}
          className="flex h-11 items-center gap-2 rounded-md bg-mint-600 px-4 text-sm font-extrabold text-white hover:bg-mint-700"
        >
          <Plus size={18} /> 상담 기록
        </button>
      </header>
      <section className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-panel">
        <div className="flex h-16 items-center justify-between border-b border-gray-100 px-5">
          <h2 className="font-extrabold">최근 상담</h2>
          <span className="text-sm font-bold text-gray-500">
            {records.data?.length ?? 0}건
          </span>
        </div>
        {records.isPending && (
          <div className="grid min-h-56 place-items-center">
            <LoaderCircle className="animate-spin text-mint-600" />
          </div>
        )}
        {records.isError && (
          <div className="grid min-h-56 place-items-center text-sm font-semibold text-rose-600">
            상담 기록을 불러오지 못했습니다.
          </div>
        )}
        {records.data?.length === 0 && (
          <div className="grid min-h-56 place-items-center px-4 text-center">
            <div>
              <ClipboardPenLine className="mx-auto text-gray-300" size={34} />
              <p className="mt-3 text-sm font-bold">아직 상담 기록이 없어요</p>
              <p className="mt-1 text-xs text-gray-500">
                빠른 상담으로 첫 기록을 남겨보세요.
              </p>
            </div>
          </div>
        )}
        <ul className="divide-y divide-gray-100">
          {records.data?.map((record) => (
            <li key={record.id}>
              <button
                onClick={() => setSelected(record)}
                className="w-full px-5 py-4 text-left hover:bg-gray-50 sm:flex sm:items-start sm:justify-between sm:gap-5"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-extrabold">
                      {maskStudentName(record.student_name)}
                    </p>
                    {record.counseling_type_name && (
                      <span
                        className="rounded-full px-2 py-1 text-[11px] font-extrabold"
                        style={{
                          color: record.counseling_type_color ?? "#4B5563",
                          backgroundColor: `${record.counseling_type_color ?? "#4B5563"}14`,
                        }}
                      >
                        {record.counseling_type_name}
                      </span>
                    )}
                    <span className="rounded-full bg-gray-100 px-2 py-1 text-[11px] font-bold text-gray-600">
                      {statusLabels[record.status] ?? record.status}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-gray-700">
                    {record.summary}
                  </p>
                  {record.content && (
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-gray-500">
                      {record.content}
                    </p>
                  )}
                </div>
                <div className="mt-3 flex shrink-0 items-center gap-2 text-xs font-bold text-gray-500 sm:mt-1">
                  <time>{record.counseling_date}</time>
                  <Pencil size={15} />
                </div>
              </button>
            </li>
          ))}
        </ul>
      </section>
      {selected && (
        <CounselingEditor
          record={selected}
          close={() => setSelected(null)}
          saved={async () => {
            setSelected(null);
            await queryClient.invalidateQueries();
          }}
        />
      )}
    </div>
  );
}

function CounselingEditor({
  record,
  close,
  saved,
}: {
  record: import("../lib/api").CounselingSummary;
  close: () => void;
  saved: () => Promise<void>;
}) {
  const [summary, setSummary] = useState(record.summary);
  const [counselingTypeId, setCounselingTypeId] = useState(
    record.counseling_type_id ?? "",
  );
  const [content, setContent] = useState(record.content ?? "");
  const [status, setStatus] = useState(record.status);
  const [followUpDate, setFollowUpDate] = useState(record.follow_up_date ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const counselingTypes = useQuery({
    queryKey: ["counseling-types"],
    queryFn: api.counselingTypes,
  });
  useEffect(() => {
    if (!counselingTypeId && counselingTypes.data?.[0])
      setCounselingTypeId(counselingTypes.data[0].id);
  }, [counselingTypeId, counselingTypes.data]);
  const update = useMutation({
    mutationFn: () =>
      api.updateCounseling(record.id, {
        counselingTypeId,
        summary,
        content,
        status,
        followUpDate: followUpDate || null,
        updatedAt: record.updated_at,
      }),
    onSuccess: saved,
  });
  const remove = useMutation({
    mutationFn: () => api.trashCounseling(record.id),
    onSuccess: saved,
  });
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
    >
      <div className="max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-lg bg-white p-5 sm:rounded-lg sm:p-7">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-extrabold text-mint-700">
              {maskStudentName(record.student_name)} · {record.counseling_date}
            </p>
            <h2 className="mt-1 text-xl font-extrabold">상담 기록 수정</h2>
          </div>
          <button
            onClick={close}
            className="grid size-10 place-items-center rounded-md hover:bg-gray-100"
            title="닫기"
          >
            <X size={20} />
          </button>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            update.mutate();
          }}
          className="mt-6 space-y-4"
        >
          <label className="block">
            <span className="mb-2 block text-sm font-bold">상담 유형</span>
            <select
              required
              value={counselingTypeId}
              onChange={(event) => setCounselingTypeId(event.target.value)}
              className="h-11 w-full rounded-md border border-gray-300 bg-white px-3 text-sm"
            >
              <option value="">유형 선택</option>
              {counselingTypes.data?.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-bold">한줄 기록</span>
            <input
              required
              maxLength={500}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className="h-11 w-full rounded-md border border-gray-300 px-3 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-bold">상세 내용</span>
            <textarea
              maxLength={50000}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="min-h-32 w-full rounded-md border border-gray-300 p-3 text-sm"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              <span className="mb-2 block text-sm font-bold">상태</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="h-11 w-full rounded-md border border-gray-300 bg-white px-3 text-sm"
              >
                <option value="normal">일반</option>
                <option value="monitoring">관찰</option>
                <option value="follow_up">후속상담 필요</option>
                <option value="in_progress">진행 중</option>
                <option value="completed">완료</option>
              </select>
            </label>
            <label>
              <span className="mb-2 block text-sm font-bold">후속상담일</span>
              <input
                type="date"
                value={followUpDate}
                onChange={(e) => setFollowUpDate(e.target.value)}
                className="h-11 w-full rounded-md border border-gray-300 px-3 text-sm"
              />
            </label>
          </div>
          {(update.isError || remove.isError) && (
            <p className="text-sm font-semibold text-rose-600">
              {update.error?.message ?? remove.error?.message}
            </p>
          )}
          <div className="flex flex-wrap justify-between gap-3 border-t border-gray-100 pt-4">
            <button
              type="button"
              onClick={() =>
                confirmDelete ? remove.mutate() : setConfirmDelete(true)
              }
              className={`flex h-11 items-center gap-2 rounded-md px-4 text-sm font-bold ${confirmDelete ? "bg-rose-600 text-white" : "text-rose-600 hover:bg-rose-50"}`}
            >
              <Trash2 size={17} />
              {confirmDelete ? "한 번 더 눌러 삭제" : "휴지통으로 이동"}
            </button>
            <button
              disabled={update.isPending}
              className="flex h-11 items-center gap-2 rounded-md bg-mint-600 px-5 text-sm font-extrabold text-white"
            >
              <Save size={17} /> 저장
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

type StudentSort = "enrollment" | "studentNumber" | "name" | "updated";

function studentSearchNumber(
  student: Pick<
    import("../lib/api").StudentSummary,
    "grade" | "class_no" | "student_no"
  >,
) {
  if (
    student.grade === null ||
    student.class_no === null ||
    student.student_no === null
  )
    return "";
  return `${student.grade}${String(student.class_no).padStart(2, "0")}${String(student.student_no).padStart(2, "0")}`;
}

function StudentPage() {
  const queryClient = useQueryClient();
  const [studentSearch, setStudentSearch] = useState("");
  const [sort, setSort] = useState<StudentSort>("enrollment");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmBulkTrash, setConfirmBulkTrash] = useState(false);
  const students = useQuery({
    queryKey: ["students"],
    queryFn: api.students,
  });
  const visibleStudents = [...(students.data ?? [])]
    .filter((student) => {
      const query = studentSearch.trim();
      const numberQuery = query.replaceAll(/\D/g, "");
      return (
        !query ||
        student.name.includes(query) ||
        (Boolean(numberQuery) && studentSearchNumber(student).includes(numberQuery))
      );
    })
    .sort((left, right) => {
      if (sort === "name") return left.name.localeCompare(right.name, "ko");
      if (sort === "updated") return right.updated_at.localeCompare(left.updated_at);
      if (sort === "studentNumber")
        return studentSearchNumber(left).localeCompare(studentSearchNumber(right));
      return (
        (left.grade ?? 99) - (right.grade ?? 99) ||
        (left.class_no ?? 999) - (right.class_no ?? 999) ||
        (left.student_no ?? 999) - (right.student_no ?? 999) ||
        left.name.localeCompare(right.name, "ko")
      );
    });
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [name, setName] = useState("");
  const [grade, setGrade] = useState("");
  const [classNo, setClassNo] = useState("");
  const [studentNo, setStudentNo] = useState("");
  const [selected, setSelected] = useState<
    import("../lib/api").StudentSummary | null
  >(null);
  const create = useMutation({
    mutationFn: () =>
      api.createStudent({
        name,
        grade: grade ? Number(grade) : null,
        classNo: classNo ? Number(classNo) : null,
        studentNo: studentNo ? Number(studentNo) : null,
      }),
    onSuccess: async () => {
      setName("");
      setGrade("");
      setClassNo("");
      setStudentNo("");
      setShowForm(false);
      await queryClient.invalidateQueries({ queryKey: ["students"] });
    },
  });
  const bulkTrash = useMutation({
    mutationFn: () => api.trashStudents(selectedIds),
    onSuccess: async () => {
      setSelectedIds([]);
      setConfirmBulkTrash(false);
      await queryClient.invalidateQueries({ queryKey: ["students"] });
    },
  });
  const toggleStudent = (studentId: string) => {
    setSelectedIds((current) =>
      current.includes(studentId)
        ? current.filter((id) => id !== studentId)
        : [...current, studentId],
    );
    setConfirmBulkTrash(false);
  };
  const allVisibleSelected =
    visibleStudents.length > 0 &&
    visibleStudents.every((student) => selectedIds.includes(student.id));
  const toggleAllVisible = () => {
    setSelectedIds((current) => {
      const visibleIds = visibleStudents.map((student) => student.id);
      return allVisibleSelected
        ? current.filter((id) => !visibleIds.includes(id))
        : [...new Set([...current, ...visibleIds])];
    });
    setConfirmBulkTrash(false);
  };

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-10 lg:pt-8">
      <header className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-mint-700">2026학년도</p>
          <h1 className="mt-1 text-3xl font-extrabold">학생</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowImport(true)}
            className="grid size-11 place-items-center rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 sm:flex sm:w-auto sm:px-4"
            title="Excel 학생 명단 등록"
          >
            <FileSpreadsheet size={18} />
            <span className="hidden text-sm font-extrabold sm:inline">
              Excel 등록
            </span>
          </button>
          <button
            onClick={() => setShowForm((value) => !value)}
            className="flex h-11 items-center gap-2 rounded-md bg-mint-600 px-4 text-sm font-extrabold text-white hover:bg-mint-700"
          >
            <Plus size={18} /> 학생 등록
          </button>
        </div>
      </header>

      {showForm && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate();
          }}
          className="mt-6 rounded-lg border border-gray-200 bg-white p-5 shadow-panel"
        >
          <div className="grid gap-4 sm:grid-cols-[2fr_1fr_1fr_1fr_auto] sm:items-end">
            <label className="block">
              <span className="mb-2 block text-sm font-bold">이름</span>
              <input
                required
                maxLength={100}
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="h-11 w-full rounded-md border border-gray-300 px-3 text-sm"
                placeholder="학생 이름"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-bold">학년</span>
              <input
                type="number"
                min="1"
                max="12"
                value={grade}
                onChange={(event) => setGrade(event.target.value)}
                className="h-11 w-full rounded-md border border-gray-300 px-3 text-sm"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-bold">반</span>
              <input
                type="number"
                min="1"
                max="99"
                value={classNo}
                onChange={(event) => setClassNo(event.target.value)}
                className="h-11 w-full rounded-md border border-gray-300 px-3 text-sm"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-bold">번호</span>
              <input
                type="number"
                min="1"
                max="999"
                value={studentNo}
                onChange={(event) => setStudentNo(event.target.value)}
                className="h-11 w-full rounded-md border border-gray-300 px-3 text-sm"
              />
            </label>
            <button
              disabled={create.isPending}
              className="h-11 rounded-md bg-ink px-5 text-sm font-extrabold text-white disabled:opacity-50"
            >
              저장
            </button>
          </div>
          {create.isError && (
            <p className="mt-3 text-sm font-semibold text-rose-600">
              {create.error.message}
            </p>
          )}
        </form>
      )}

      <label className="relative mt-6 block">
        <Search
          size={18}
          className="pointer-events-none absolute left-3.5 top-3.5 text-gray-400"
        />
        <input
          value={studentSearch}
          onChange={(e) => setStudentSearch(e.target.value)}
          className="h-11 w-full rounded-md border border-gray-300 bg-white pl-11 pr-3 text-sm shadow-sm"
          placeholder="학생 이름 또는 학번 검색 (예: 10302)"
        />
      </label>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <label className="flex h-10 items-center gap-2 text-sm font-bold text-gray-600">
          <ArrowUpDown size={16} className="text-gray-400" />
          <span className="sr-only">학생 목록 정렬</span>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as StudentSort)}
            className="h-10 rounded-md border border-gray-300 bg-white px-3 text-sm font-bold text-gray-700"
          >
            <option value="enrollment">학년·반·번호순</option>
            <option value="studentNumber">학번순</option>
            <option value="name">이름순</option>
            <option value="updated">최근 수정순</option>
          </select>
        </label>
        {selectedIds.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-gray-600">
              {selectedIds.length}명 선택
            </span>
            <button
              onClick={() =>
                confirmBulkTrash
                  ? bulkTrash.mutate()
                  : setConfirmBulkTrash(true)
              }
              disabled={bulkTrash.isPending}
              className={`flex h-10 items-center gap-2 rounded-md px-3 text-sm font-extrabold disabled:opacity-50 ${confirmBulkTrash ? "bg-rose-600 text-white" : "border border-rose-200 text-rose-700 hover:bg-rose-50"}`}
            >
              <Trash2 size={16} />
              {bulkTrash.isPending
                ? "이동 중"
                : confirmBulkTrash
                  ? "한 번 더 눌러 휴지통 이동"
                  : "선택 학생 휴지통 이동"}
            </button>
          </div>
        )}
      </div>
      {bulkTrash.isError && (
        <p className="mt-3 text-sm font-semibold text-rose-600">
          {bulkTrash.error.message}
        </p>
      )}

      <section className="mt-4 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-panel">
        <div className="flex h-16 items-center justify-between border-b border-gray-100 px-5">
          <h2 className="font-extrabold">학생 목록</h2>
          <span className="text-sm font-bold text-gray-500">
            {visibleStudents.length}명
          </span>
        </div>
        {students.isPending && (
          <div className="grid min-h-52 place-items-center">
            <LoaderCircle className="animate-spin text-mint-600" />
          </div>
        )}
        {students.isError && (
          <div className="grid min-h-52 place-items-center px-4 text-sm font-semibold text-rose-600">
            학생 목록을 불러오지 못했습니다.
          </div>
        )}
        {students.isSuccess && visibleStudents.length === 0 && (
          <div className="grid min-h-52 place-items-center px-4 text-center">
            <div>
              <UsersRound className="mx-auto text-gray-300" size={34} />
              <p className="mt-3 text-sm font-bold text-gray-700">
                등록된 학생이 없어요
              </p>
              <p className="mt-1 text-xs text-gray-500">
                학생을 등록하면 빠른 상담을 시작할 수 있습니다.
              </p>
            </div>
          </div>
        )}
        <ul className="divide-y divide-gray-100">
          <li className="flex items-center gap-3 bg-gray-50 px-5 py-3 text-xs font-bold text-gray-500">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={toggleAllVisible}
              aria-label="현재 목록의 학생 전체 선택"
              className="size-4 accent-mint-600"
            />
            현재 목록 전체 선택
          </li>
          {visibleStudents.map((student) => (
            <li key={student.id} className="flex items-stretch">
              <label className="flex w-12 shrink-0 cursor-pointer items-center justify-center border-r border-gray-100 hover:bg-mint-50">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(student.id)}
                  onChange={() => toggleStudent(student.id)}
                  aria-label={`${studentSearchNumber(student) || "학번 미입력"} 학생 선택`}
                  className="size-4 accent-mint-600"
                />
              </label>
              <button
                onClick={() => setSelected(student)}
                className="flex min-w-0 flex-1 items-center justify-between gap-4 px-5 py-4 text-left hover:bg-gray-50"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-mint-50 font-extrabold text-mint-700">
                    <UserRound size={18} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-extrabold">
                      {student.is_favorite ? "★ " : ""}
                      {studentLabel(student)}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {student.school_year ?? 2026}학년도 ·{" "}
                      {student.status === "active" ? "재학" : student.status}
                    </p>
                  </div>
                </div>
                <ChevronRight size={18} className="shrink-0 text-gray-400" />
              </button>
            </li>
          ))}
        </ul>
      </section>
      {selected && (
        <StudentEditor
          student={selected}
          close={() => setSelected(null)}
          saved={async () => {
            setSelected(null);
            await queryClient.invalidateQueries();
          }}
        />
      )}
      {showImport && (
        <StudentExcelImport
          close={() => setShowImport(false)}
          imported={async () => {
            setShowImport(false);
            await queryClient.invalidateQueries({ queryKey: ["students"] });
          }}
        />
      )}
    </div>
  );
}

function StudentExcelImport({
  close,
  imported,
}: {
  close: () => void;
  imported: () => Promise<void>;
}) {
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ParsedStudentRow[]>([]);
  const [parseError, setParseError] = useState("");
  const upload = useMutation({
    mutationFn: async () => {
      let importedCount = 0;
      let skippedCount = 0;
      for (let index = 0; index < rows.length; index += 200) {
        const result = await api.importStudents(rows.slice(index, index + 200));
        importedCount += result.imported;
        skippedCount += result.skipped;
      }
      return { imported: importedCount, skipped: skippedCount };
    },
  });

  const parseFile = async (file?: File) => {
    setRows([]);
    setParseError("");
    upload.reset();
    if (!file) return;
    setFileName(file.name);
    try {
      const { readSheet } = await import("read-excel-file/browser");
      const sheet = await readSheet(file);
      setRows(parseStudentSheet(sheet));
    } catch (error) {
      setParseError(
        error instanceof Error
          ? error.message
          : "Excel 파일을 읽지 못했습니다.",
      );
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="student-import-title"
    >
      <div className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-lg bg-white p-5 sm:rounded-lg sm:p-7">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-extrabold text-mint-700">
              학생 일괄 등록
            </p>
            <h2
              id="student-import-title"
              className="mt-1 text-xl font-extrabold"
            >
              Excel 명단 등록
            </h2>
          </div>
          <button
            onClick={close}
            className="grid size-10 place-items-center rounded-md hover:bg-gray-100"
            title="닫기"
          >
            <X size={20} />
          </button>
        </div>
        <label className="mt-6 flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-gray-300 bg-gray-50 px-4 text-center hover:bg-mint-50">
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            onChange={(event) => void parseFile(event.target.files?.[0])}
          />
          <Upload size={24} className="text-mint-700" />
          <span className="mt-2 text-sm font-extrabold text-gray-700">
            {fileName || "Excel 학생 명단 선택"}
          </span>
          <span className="mt-1 text-xs text-gray-500">
            이름 · 학년 · 반 · 번호
          </span>
        </label>
        <a
          href="/student-import-template.xlsx"
          download
          className="mt-3 inline-flex h-9 items-center gap-2 rounded-md px-3 text-xs font-extrabold text-mint-700 hover:bg-mint-50"
        >
          <Download size={15} /> Excel 양식 받기
        </a>
        {parseError && (
          <p className="mt-4 rounded-md bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
            {parseError}
          </p>
        )}
        {rows.length > 0 && (
          <>
            <div className="mt-5 flex items-center justify-between">
              <h3 className="font-extrabold">등록 미리보기</h3>
              <span className="text-sm font-bold text-mint-700">
                {rows.length}명
              </span>
            </div>
            <div className="mt-3 overflow-x-auto rounded-md border border-gray-200">
              <table className="w-full min-w-[420px] text-left text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500">
                  <tr>
                    <th className="px-3 py-2">행</th>
                    <th className="px-3 py-2">이름</th>
                    <th className="px-3 py-2">학년</th>
                    <th className="px-3 py-2">반</th>
                    <th className="px-3 py-2">번호</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.slice(0, 8).map((row) => (
                    <tr key={row.sourceRow}>
                      <td className="px-3 py-2 text-gray-400">
                        {row.sourceRow}
                      </td>
                      <td className="px-3 py-2 font-bold">
                        {maskStudentName(row.name)}
                      </td>
                      <td className="px-3 py-2">{row.grade}</td>
                      <td className="px-3 py-2">{row.classNo}</td>
                      <td className="px-3 py-2">{row.studentNo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 8 && (
                <p className="border-t border-gray-100 px-3 py-2 text-center text-xs font-bold text-gray-500">
                  외 {rows.length - 8}명
                </p>
              )}
            </div>
            {upload.isError && (
              <p className="mt-3 text-sm font-semibold text-rose-600">
                {upload.error.message}
              </p>
            )}
            {upload.isSuccess ? (
              <div className="mt-5 rounded-md bg-mint-50 p-4">
                <p className="text-sm font-extrabold text-mint-800">
                  등록 {upload.data.imported}명 · 중복 건너뜀{" "}
                  {upload.data.skipped}명
                </p>
                <button
                  onClick={() => void imported()}
                  className="mt-3 h-10 w-full rounded-md bg-mint-700 text-sm font-extrabold text-white"
                >
                  학생 목록에서 확인
                </button>
              </div>
            ) : (
              <button
                onClick={() => upload.mutate()}
                disabled={upload.isPending}
                className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-md bg-mint-600 text-sm font-extrabold text-white disabled:opacity-50"
              >
                {upload.isPending ? (
                  <LoaderCircle size={18} className="animate-spin" />
                ) : (
                  <FileSpreadsheet size={18} />
                )}
                {upload.isPending ? "등록 중" : `${rows.length}명 등록`}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function StudentEditor({
  student,
  close,
  saved,
}: {
  student: import("../lib/api").StudentSummary;
  close: () => void;
  saved: () => Promise<void>;
}) {
  const [name, setName] = useState(student.name);
  const [favorite, setFavorite] = useState(Boolean(student.is_favorite));
  const [status, setStatus] = useState(student.status);
  const [phone, setPhone] = useState("");
  const [parentPhone, setParentPhone] = useState("");
  const [memo, setMemo] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const detail = useQuery({
    queryKey: ["student", student.id],
    queryFn: () => api.student(student.id),
  });
  const timeline = useQuery({
    queryKey: ["counseling"],
    queryFn: api.counseling,
    select: (records) =>
      records.filter((record) => record.student_id === student.id),
  });
  const update = useMutation({
    mutationFn: () =>
      api.updateStudent(student.id, {
        name,
        phone,
        parentPhone,
        memo,
        favorite,
        status,
        updatedAt: detail.data?.updated_at ?? student.updated_at,
      }),
    onSuccess: saved,
  });
  const remove = useMutation({
    mutationFn: () => api.trashStudent(student.id),
    onSuccess: saved,
  });
  useEffect(() => {
    if (!detail.data) return;
    setPhone(detail.data.phone ?? "");
    setParentPhone(detail.data.parent_phone ?? "");
    setMemo(detail.data.memo ?? "");
  }, [detail.data]);
  const hydrate = () => {
    if (!detail.data) return;
    setPhone(detail.data.phone ?? "");
    setParentPhone(detail.data.parent_phone ?? "");
    setMemo(detail.data.memo ?? "");
  };
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
    >
      <div className="max-h-[94dvh] w-full max-w-2xl overflow-y-auto rounded-t-lg bg-white p-5 sm:rounded-lg sm:p-7">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-extrabold text-mint-700">
              {student.grade
                ? `${student.grade}학년 ${student.class_no ?? "-"}반 ${student.student_no ?? "-"}번`
                : "학적 미입력"}
            </p>
            <h2 className="mt-1 text-xl font-extrabold">
              {studentLabel(student)}
            </h2>
          </div>
          <button
            onClick={close}
            className="grid size-10 place-items-center rounded-md hover:bg-gray-100"
            title="닫기"
          >
            <X size={20} />
          </button>
        </div>
        {detail.isSuccess &&
          phone === "" &&
          parentPhone === "" &&
          memo === "" && (
            <button
              type="button"
              className="sr-only"
              onClick={hydrate}
              ref={(node) => node?.click()}
            >
              정보 불러오기
            </button>
          )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            update.mutate();
          }}
          className="mt-5 space-y-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              <span className="mb-2 block text-sm font-bold">이름</span>
              <input
                required
                maxLength={100}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-11 w-full rounded-md border border-gray-300 px-3 text-sm"
              />
            </label>
            <label>
              <span className="mb-2 block text-sm font-bold">재학 상태</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="h-11 w-full rounded-md border border-gray-300 bg-white px-3 text-sm"
              >
                <option value="active">재학</option>
                <option value="graduated">졸업</option>
                <option value="transferred">전학</option>
                <option value="inactive">비활성</option>
              </select>
            </label>
            <label>
              <span className="mb-2 block text-sm font-bold">학생 연락처</span>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                maxLength={30}
                className="h-11 w-full rounded-md border border-gray-300 px-3 text-sm"
              />
            </label>
            <label>
              <span className="mb-2 block text-sm font-bold">
                보호자 연락처
              </span>
              <input
                value={parentPhone}
                onChange={(e) => setParentPhone(e.target.value)}
                maxLength={30}
                className="h-11 w-full rounded-md border border-gray-300 px-3 text-sm"
              />
            </label>
          </div>
          <label className="block">
            <span className="mb-2 block text-sm font-bold">학생 메모</span>
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              maxLength={5000}
              className="min-h-20 w-full rounded-md border border-gray-300 p-3 text-sm"
            />
          </label>
          <label className="flex h-11 items-center gap-3 rounded-md border border-gray-300 px-3 text-sm font-bold">
            <input
              type="checkbox"
              checked={favorite}
              onChange={(e) => setFavorite(e.target.checked)}
              className="size-4 accent-mint-600"
            />{" "}
            자주 보는 학생
          </label>
          {(update.isError || remove.isError) && (
            <p className="text-sm font-semibold text-rose-600">
              {update.error?.message ?? remove.error?.message}
            </p>
          )}
          <div className="flex flex-wrap justify-between gap-3 border-t border-gray-100 pt-4">
            <button
              type="button"
              onClick={() =>
                confirmDelete ? remove.mutate() : setConfirmDelete(true)
              }
              className={`flex h-11 items-center gap-2 rounded-md px-4 text-sm font-bold ${confirmDelete ? "bg-rose-600 text-white" : "text-rose-600 hover:bg-rose-50"}`}
            >
              <Trash2 size={17} />
              {confirmDelete ? "한 번 더 눌러 삭제" : "휴지통으로 이동"}
            </button>
            <button
              disabled={update.isPending}
              className="flex h-11 items-center gap-2 rounded-md bg-mint-600 px-5 text-sm font-extrabold text-white"
            >
              <Save size={17} /> 저장
            </button>
          </div>
        </form>
        <section className="mt-6 border-t border-gray-200 pt-5">
          <div className="flex items-center justify-between">
            <h3 className="font-extrabold">누적 상담 타임라인</h3>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-500">
                {timeline.data?.length ?? 0}건
              </span>
              <button
                type="button"
                onClick={() =>
                  void downloadStudentCounselingExcel(
                    student,
                    timeline.data ?? [],
                  )
                }
                disabled={!timeline.data?.length}
                className="grid size-9 place-items-center rounded-md text-mint-700 hover:bg-mint-50 disabled:opacity-40"
                title="학생 상담 기록 Excel 다운로드"
              >
                <FileSpreadsheet size={17} />
              </button>
            </div>
          </div>
          <ol className="mt-4 space-y-3">
            {timeline.data?.map((record) => (
              <li key={record.id} className="border-l-2 border-mint-200 pl-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-extrabold">{record.summary}</p>
                  <time className="shrink-0 text-xs font-bold text-gray-500">
                    {record.counseling_date}
                  </time>
                </div>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-gray-500">
                  {record.content || statusLabels[record.status]}
                </p>
              </li>
            ))}
          </ol>
          {timeline.data?.length === 0 && (
            <p className="py-6 text-center text-sm text-gray-500">
              아직 상담 기록이 없습니다.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

function QuickCounseling({ close }: { close: () => void }) {
  const queryClient = useQueryClient();
  const students = useQuery({ queryKey: ["students"], queryFn: api.students });
  const counselingTypes = useQuery({
    queryKey: ["counseling-types"],
    queryFn: api.counselingTypes,
  });
  const [studentId, setStudentId] = useState("");
  const [counselingTypeId, setCounselingTypeId] = useState("");
  const [date, setDate] = useState(new Date().toLocaleDateString("en-CA"));
  const [summary, setSummary] = useState("");
  const [content, setContent] = useState("");
  const [status, setStatus] = useState("normal");
  const [followUpDate, setFollowUpDate] = useState("");
  useEffect(() => {
    if (!counselingTypeId && counselingTypes.data?.[0])
      setCounselingTypeId(counselingTypes.data[0].id);
  }, [counselingTypeId, counselingTypes.data]);
  const create = useMutation({
    mutationFn: () =>
      api.createCounseling({
        studentId,
        counselingTypeId,
        date,
        summary,
        content,
        status,
        followUpDate: followUpDate || null,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      close();
    },
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-title"
    >
      <div className="max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-lg bg-white p-5 shadow-2xl sm:rounded-lg sm:p-7">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-extrabold text-mint-700">20초 기록</p>
            <h2 id="quick-title" className="mt-1 text-xl font-extrabold">
              빠른 상담
            </h2>
          </div>
          <button
            onClick={close}
            className="grid size-10 place-items-center rounded-md text-gray-500 hover:bg-gray-100"
            title="닫기"
          >
            <X size={20} />
          </button>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate();
          }}
          className="mt-6 space-y-4"
        >
          <label className="block">
            <span className="mb-2 block text-sm font-bold">학생</span>
            <select
              required
              value={studentId}
              onChange={(event) => setStudentId(event.target.value)}
              className="h-12 w-full rounded-md border border-gray-300 bg-white px-3 text-sm"
            >
              <option value="">학생 선택</option>
              {students.data?.map((student) => (
                <option key={student.id} value={student.id}>
                  {studentLabel(student)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-bold">상담 유형</span>
            <select
              required
              value={counselingTypeId}
              onChange={(event) => setCounselingTypeId(event.target.value)}
              className="h-12 w-full rounded-md border border-gray-300 bg-white px-3 text-sm"
            >
              <option value="">유형 선택</option>
              {counselingTypes.data?.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-bold">상담일</span>
              <input
                type="date"
                required
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className="h-12 w-full rounded-md border border-gray-300 px-3 text-sm"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-bold">상태</span>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                className="h-12 w-full rounded-md border border-gray-300 bg-white px-3 text-sm"
              >
                <option value="normal">일반</option>
                <option value="monitoring">관찰</option>
                <option value="follow_up">후속상담 필요</option>
                <option value="in_progress">진행 중</option>
                <option value="completed">완료</option>
              </select>
            </label>
          </div>
          <label className="block">
            <span className="mb-2 block text-sm font-bold">한줄 기록</span>
            <input
              required
              maxLength={500}
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              className="h-12 w-full rounded-md border border-gray-300 px-3 text-sm"
              placeholder="핵심 내용을 짧게 기록하세요"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-bold">
              상세 내용 <span className="font-medium text-gray-400">선택</span>
            </span>
            <textarea
              maxLength={50000}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              className="min-h-28 w-full resize-y rounded-md border border-gray-300 p-3 text-sm"
              placeholder="필요한 경우 자세한 내용을 남기세요"
            />
          </label>
          {(status === "follow_up" || status === "in_progress") && (
            <label className="block">
              <span className="mb-2 block text-sm font-bold">후속상담일</span>
              <input
                required
                type="date"
                min={date}
                value={followUpDate}
                onChange={(event) => setFollowUpDate(event.target.value)}
                className="h-12 w-full rounded-md border border-gray-300 px-3 text-sm"
              />
            </label>
          )}
          {students.data?.length === 0 && (
            <p className="rounded-md bg-amber-50 px-3 py-2.5 text-sm font-semibold text-amber-700">
              먼저 학생을 등록해주세요.
            </p>
          )}
          {create.isError && (
            <p className="rounded-md bg-rose-50 px-3 py-2.5 text-sm font-semibold text-rose-700">
              {create.error.message}
            </p>
          )}
          <button
            disabled={create.isPending || !students.data?.length}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-md bg-mint-600 text-sm font-extrabold text-white hover:bg-mint-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ClipboardPenLine size={18} /> 상담 기록 저장
          </button>
        </form>
      </div>
    </div>
  );
}

function CalendarPage() {
  const queryClient = useQueryClient();
  const now = new Date();
  const [cursor, setCursor] = useState(
    new Date(now.getFullYear(), now.getMonth(), 1),
  );
  const [selectedDate, setSelectedDate] = useState(
    now.toLocaleDateString("en-CA"),
  );
  const [showForm, setShowForm] = useState(false);
  const [studentId, setStudentId] = useState("");
  const [time, setTime] = useState("14:00");
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState<
    import("../lib/api").ScheduleSummary | null
  >(null);
  const month = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
  const schedules = useQuery({
    queryKey: ["schedules", month],
    queryFn: () => api.schedules(month),
  });
  const students = useQuery({ queryKey: ["students"], queryFn: api.students });
  const create = useMutation({
    mutationFn: () =>
      api.createSchedule({ studentId, date: selectedDate, time, note }),
    onSuccess: async () => {
      setStudentId("");
      setNote("");
      setShowForm(false);
      await queryClient.invalidateQueries({ queryKey: ["schedules"] });
    },
  });
  const firstDay = new Date(
    cursor.getFullYear(),
    cursor.getMonth(),
    1,
  ).getDay();
  const daysInMonth = new Date(
    cursor.getFullYear(),
    cursor.getMonth() + 1,
    0,
  ).getDate();
  const cells = Array.from({ length: 42 }, (_, index) => {
    const day = index - firstDay + 1;
    return day >= 1 && day <= daysInMonth ? day : null;
  });
  const dateFor = (day: number) => `${month}-${String(day).padStart(2, "0")}`;
  const holidays = koreanHolidays(cursor.getFullYear());
  const moveMonth = (offset: number) => {
    const next = new Date(cursor.getFullYear(), cursor.getMonth() + offset, 1);
    setCursor(next);
    setSelectedDate(
      `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`,
    );
  };

  return (
    <div className="mx-auto w-full max-w-[1280px] px-3 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-10 lg:pt-8">
      <header className="flex items-center justify-between gap-4 px-1">
        <div>
          <p className="text-sm font-bold text-mint-700">상담 계획</p>
          <h1 className="mt-1 text-3xl font-extrabold">일정</h1>
        </div>
        <button
          onClick={() => setShowForm((value) => !value)}
          className="flex h-11 items-center gap-2 rounded-md bg-mint-600 px-4 text-sm font-extrabold text-white hover:bg-mint-700"
        >
          <CalendarPlus size={18} /> 일정 등록
        </button>
      </header>
      {showForm && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate();
          }}
          className="mt-6 rounded-lg border border-gray-200 bg-white p-5 shadow-panel"
        >
          <div className="grid gap-4 md:grid-cols-[1.5fr_1fr_1fr_2fr_auto] md:items-end">
            <label>
              <span className="mb-2 block text-sm font-bold">학생</span>
              <select
                required
                value={studentId}
                onChange={(event) => setStudentId(event.target.value)}
                className="h-11 w-full rounded-md border border-gray-300 bg-white px-3 text-sm"
              >
                <option value="">학생 선택</option>
                {students.data?.map((student) => (
                  <option key={student.id} value={student.id}>
                    {studentLabel(student)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="mb-2 block text-sm font-bold">날짜</span>
              <input
                required
                type="date"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
                className="h-11 w-full rounded-md border border-gray-300 px-3 text-sm"
              />
            </label>
            <label>
              <span className="mb-2 block text-sm font-bold">시간</span>
              <input
                required
                type="time"
                value={time}
                onChange={(event) => setTime(event.target.value)}
                className="h-11 w-full rounded-md border border-gray-300 px-3 text-sm"
              />
            </label>
            <label>
              <span className="mb-2 block text-sm font-bold">메모</span>
              <input
                maxLength={1000}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                className="h-11 w-full rounded-md border border-gray-300 px-3 text-sm"
                placeholder="상담 주제 또는 준비사항"
              />
            </label>
            <button
              disabled={create.isPending}
              className="h-11 rounded-md bg-ink px-5 text-sm font-extrabold text-white disabled:opacity-50"
            >
              저장
            </button>
          </div>
          {create.isError && (
            <p className="mt-3 text-sm font-semibold text-rose-600">
              {create.error.message}
            </p>
          )}
        </form>
      )}

      <section className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-panel">
        <div className="flex h-16 items-center justify-between border-b border-gray-100 px-4 sm:px-5">
          <button
            onClick={() => moveMonth(-1)}
            className="grid size-9 place-items-center rounded-md text-gray-500 hover:bg-gray-100"
            title="이전 달"
          >
            <ChevronLeft size={20} />
          </button>
          <h2 className="text-lg font-extrabold">
            {cursor.getFullYear()}년 {cursor.getMonth() + 1}월
          </h2>
          <button
            onClick={() => moveMonth(1)}
            className="grid size-9 place-items-center rounded-md text-gray-500 hover:bg-gray-100"
            title="다음 달"
          >
            <ChevronRight size={20} />
          </button>
        </div>
        <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50 text-center text-xs font-bold text-gray-500">
          {["일", "월", "화", "수", "목", "금", "토"].map((day, index) => (
            <div
              key={day}
              className={`py-3 ${index === 0 ? "text-rose-500" : index === 6 ? "text-sky-600" : ""}`}
            >
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((day, index) => {
            const date = day ? dateFor(day) : "";
            const daySchedules = day
              ? (schedules.data?.filter(
                  (item) => item.scheduled_date === date,
                ) ?? [])
              : [];
            const selected = date === selectedDate;
            const holidayName = date ? holidays.get(date) : undefined;
            const isHoliday = Boolean(holidayName);
            return (
              <button
                key={`${month}-${index}`}
                disabled={!day}
                onClick={() => day && setSelectedDate(date)}
                title={holidayName}
                className={`flex min-h-[72px] flex-col items-start justify-start border-b border-r border-gray-100 p-2 text-left align-top sm:min-h-[104px] sm:p-3 ${day ? "hover:bg-mint-50/50" : "bg-gray-50/60"} ${selected ? "bg-mint-50 ring-2 ring-inset ring-mint-500" : ""}`}
              >
                <span
                  className={`inline-flex min-w-7 items-center justify-start rounded-full px-1 text-base font-extrabold leading-7 sm:min-w-8 sm:px-1.5 sm:text-lg sm:leading-8 ${date === now.toLocaleDateString("en-CA") ? "bg-mint-600 text-white" : isHoliday || index % 7 === 0 ? "text-rose-500" : "text-gray-700"}`}
                >
                  {day}
                </span>
                {holidayName && (
                  <span className="mt-0.5 truncate text-[9px] font-bold text-rose-500 sm:text-[10px]">
                    {holidayName}
                  </span>
                )}
                <div className="mt-1 w-full space-y-1">
                  {daySchedules.slice(0, 2).map((item) => (
                    <span
                      key={item.id}
                      className={`block truncate rounded-sm px-1 py-0.5 text-[9px] font-bold sm:text-[11px] ${
                        item.status === "cancelled"
                          ? "bg-rose-50 text-rose-400 line-through"
                          : item.status === "completed"
                            ? "bg-gray-100 text-gray-500"
                            : "bg-sky-50 text-sky-700"
                      }`}
                    >
                      {item.scheduled_time ?? ""}{" "}
                      {maskStudentName(item.student_name)}
                    </span>
                  ))}
                  {daySchedules.length > 2 && (
                    <span className="block text-[9px] font-bold text-gray-500 sm:text-[10px]">
                      +{daySchedules.length - 2}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-panel">
        <div className="flex h-16 items-center justify-between border-b border-gray-100 px-5">
          <div>
            <h2 className="font-extrabold">
              {cursor.getMonth() + 1}월 일정 목록
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              달력의 날짜를 선택해 새 일정을 등록할 수 있습니다.
            </p>
          </div>
          <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-extrabold text-gray-600">
            {schedules.data?.length ?? 0}건
          </span>
        </div>
        {schedules.isPending && (
          <div className="grid min-h-48 place-items-center">
            <LoaderCircle className="animate-spin text-mint-600" />
          </div>
        )}
        {schedules.data?.length === 0 && (
          <div className="grid min-h-48 place-items-center text-center">
            <div>
              <CalendarDays className="mx-auto text-gray-300" size={34} />
              <p className="mt-3 text-sm font-bold">등록된 일정이 없어요</p>
            </div>
          </div>
        )}
        <ul className="divide-y divide-gray-100">
          {schedules.data?.map((item) => (
            <li key={item.id}>
              <button
                onClick={() => setEditing(item)}
                className={`flex w-full items-start gap-4 px-5 py-4 text-left hover:bg-gray-50 ${
                  item.status === "cancelled" ? "opacity-70" : ""
                }`}
              >
                <time className="w-14 shrink-0 text-center">
                  <span className={`block text-xs font-bold ${
                    item.status === "cancelled" ? "text-rose-400" : "text-gray-500"
                  }`}>
                    {item.scheduled_date.slice(5, 7)}월
                  </span>
                  <span className={`block text-2xl font-extrabold ${
                    item.status === "cancelled" ? "text-rose-400 line-through" : "text-ink"
                  }`}>
                    {Number(item.scheduled_date.slice(8, 10))}
                  </span>
                </time>
                <div className="min-w-0 flex-1 border-l border-gray-200 pl-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className={`font-extrabold ${
                      item.status === "cancelled" ? "text-rose-500 line-through" : ""
                    }`}>
                      {maskStudentName(item.student_name)}
                    </p>
                    <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${
                      item.status === "cancelled"
                        ? "bg-rose-50 text-rose-600"
                        : item.status === "completed"
                          ? "bg-gray-100 text-gray-600"
                          : "bg-mint-50 text-mint-700"
                    }`}>
                      {item.status === "scheduled"
                        ? "예정"
                        : item.status === "completed"
                          ? "완료"
                          : "취소"}
                    </span>
                  </div>
                  <p className={`mt-1 text-sm font-semibold ${
                    item.status === "cancelled" ? "text-rose-400 line-through" : "text-gray-600"
                  }`}>
                    {item.scheduled_time ?? "시간 미정"}
                    {item.note ? ` · ${item.note}` : ""}
                  </p>
                </div>
                <Pencil size={16} className="mt-2 shrink-0 text-gray-400" />
              </button>
            </li>
          ))}
        </ul>
      </section>
      {editing && (
        <ScheduleEditor
          schedule={editing}
          close={() => setEditing(null)}
          saved={async () => {
            setEditing(null);
            await queryClient.invalidateQueries();
          }}
        />
      )}
    </div>
  );
}

function ScheduleEditor({
  schedule,
  close,
  saved,
}: {
  schedule: import("../lib/api").ScheduleSummary;
  close: () => void;
  saved: () => Promise<void>;
}) {
  const [date, setDate] = useState(schedule.scheduled_date);
  const [time, setTime] = useState(schedule.scheduled_time ?? "");
  const [note, setNote] = useState(schedule.note ?? "");
  const [summary, setSummary] = useState(
    schedule.note || `${maskStudentName(schedule.student_name)} 상담`,
  );
  const [content, setContent] = useState("");
  const [completing, setCompleting] = useState(false);
  const update = useMutation({
    mutationFn: (status: "scheduled" | "cancelled") =>
      api.updateSchedule(schedule.id, {
        date,
        time: time || null,
        note,
        status,
      }),
    onSuccess: saved,
  });
  const complete = useMutation({
    mutationFn: () =>
      api.completeSchedule(schedule.id, {
        summary,
        content,
        status: "completed",
      }),
    onSuccess: saved,
  });
  const error = update.error?.message ?? complete.error?.message;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
    >
      <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-lg bg-white p-5 sm:rounded-lg sm:p-7">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-extrabold text-mint-700">
              {maskStudentName(schedule.student_name)}
            </p>
            <h2 className="mt-1 text-xl font-extrabold">일정 관리</h2>
          </div>
          <button
            onClick={close}
            className="grid size-10 place-items-center rounded-md hover:bg-gray-100"
            title="닫기"
          >
            <X size={20} />
          </button>
        </div>
        {schedule.status !== "scheduled" ? (
          <p className="mt-6 rounded-md bg-gray-50 p-4 text-sm font-semibold text-gray-600">
            {schedule.status === "completed"
              ? "상담 기록으로 완료된 일정입니다."
              : "취소된 일정입니다."}
          </p>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (completing) complete.mutate();
              else update.mutate("scheduled");
            }}
            className="mt-6 space-y-4"
          >
            {completing ? (
              <>
                <label className="block">
                  <span className="mb-2 block text-sm font-bold">
                    상담 한줄 기록
                  </span>
                  <input
                    required
                    maxLength={500}
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    className="h-11 w-full rounded-md border border-gray-300 px-3 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-bold">
                    상세 내용
                  </span>
                  <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    className="min-h-28 w-full rounded-md border border-gray-300 p-3 text-sm"
                  />
                </label>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <label>
                    <span className="mb-2 block text-sm font-bold">날짜</span>
                    <input
                      required
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="h-11 w-full rounded-md border border-gray-300 px-3 text-sm"
                    />
                  </label>
                  <label>
                    <span className="mb-2 block text-sm font-bold">시간</span>
                    <input
                      type="time"
                      value={time}
                      onChange={(e) => setTime(e.target.value)}
                      className="h-11 w-full rounded-md border border-gray-300 px-3 text-sm"
                    />
                  </label>
                </div>
                <label className="block">
                  <span className="mb-2 block text-sm font-bold">메모</span>
                  <input
                    maxLength={1000}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="h-11 w-full rounded-md border border-gray-300 px-3 text-sm"
                  />
                </label>
              </>
            )}
            {error && (
              <p className="text-sm font-semibold text-rose-600">{error}</p>
            )}
            <div className="flex flex-wrap justify-between gap-2 border-t border-gray-100 pt-4">
              <button
                type="button"
                onClick={() =>
                  completing ? setCompleting(false) : update.mutate("cancelled")
                }
                className="h-11 rounded-md px-4 text-sm font-bold text-rose-600 hover:bg-rose-50"
              >
                {completing ? "일정 수정으로" : "일정 취소"}
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setCompleting(true)}
                  className="h-11 rounded-md bg-sky-50 px-4 text-sm font-extrabold text-sky-700"
                >
                  상담 완료
                </button>
                <button className="h-11 rounded-md bg-mint-600 px-4 text-sm font-extrabold text-white">
                  {completing ? "완료 기록 저장" : "일정 저장"}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function ReportsPage() {
  const today = new Date().toLocaleDateString("en-CA");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState(`${new Date().getFullYear()}-01-01`);
  const [to, setTo] = useState(today);
  const [status, setStatus] = useState("");
  const [filters, setFilters] = useState({ q: "", from, to, status: "" });
  const results = useQuery({
    queryKey: ["search", filters],
    queryFn: () => api.search(filters),
  });
  const exportExcel = async () => {
    const rows = [
      ["상담일", "학생", "상태", "한줄 기록", "상세 내용", "후속상담일"],
      ...(results.data ?? []).map((item) => [
        item.counseling_date,
        maskStudentName(item.student_name),
        statusLabels[item.status] ?? item.status,
        item.summary,
        item.content,
        item.follow_up_date ?? "",
      ]),
    ];
    const XLSX = await import("xlsx-js-style");
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    sheet["!cols"] = [
      { wch: 12 },
      { wch: 12 },
      { wch: 14 },
      { wch: 36 },
      { wch: 64 },
      { wch: 14 },
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "상담기록");
    XLSX.writeFile(workbook, `상담기록_${today}.xlsx`, {
      compression: true,
    });
  };
  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-10 lg:pt-8">
      <header>
        <p className="text-sm font-bold text-mint-700">기록 찾기</p>
        <h1 className="mt-1 text-3xl font-extrabold">통합 검색</h1>
      </header>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setFilters({ q, from, to, status });
        }}
        className="mt-6 grid gap-4 rounded-lg border border-gray-200 bg-white p-5 shadow-panel md:grid-cols-[2fr_1fr_1fr_1fr_auto] md:items-end"
      >
        <label>
          <span className="mb-2 block text-sm font-bold">검색어</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-11 w-full rounded-md border border-gray-300 px-3 text-sm"
            placeholder="학생 이름, 상담 내용"
          />
        </label>
        <label>
          <span className="mb-2 block text-sm font-bold">시작일</span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-11 w-full rounded-md border border-gray-300 px-3 text-sm"
          />
        </label>
        <label>
          <span className="mb-2 block text-sm font-bold">종료일</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-11 w-full rounded-md border border-gray-300 px-3 text-sm"
          />
        </label>
        <label>
          <span className="mb-2 block text-sm font-bold">상태</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-11 w-full rounded-md border border-gray-300 bg-white px-3 text-sm"
          >
            <option value="">전체</option>
            {Object.entries(statusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button className="flex h-11 items-center justify-center gap-2 rounded-md bg-ink px-5 text-sm font-extrabold text-white">
          <Search size={17} /> 검색
        </button>
      </form>
      <section className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-panel">
        <div className="flex h-16 items-center justify-between border-b border-gray-100 px-5">
          <h2 className="font-extrabold">
            검색 결과{" "}
            <span className="ml-1 text-sm text-gray-500">
              {results.data?.length ?? 0}건
            </span>
          </h2>
          <button
            onClick={() => void exportExcel()}
            disabled={!results.data?.length}
            className="flex h-9 items-center gap-2 rounded-md bg-mint-50 px-3 text-xs font-extrabold text-mint-700 disabled:opacity-40"
          >
            <Download size={16} /> Excel 내보내기
          </button>
        </div>
        {results.isPending ? (
          <div className="grid min-h-48 place-items-center">
            <LoaderCircle className="animate-spin text-mint-600" />
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {results.data?.map((item) => (
              <li key={item.id} className="px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-extrabold">
                    {maskStudentName(item.student_name)}
                  </p>
                  <time className="text-xs font-bold text-gray-500">
                    {item.counseling_date}
                  </time>
                </div>
                <p className="mt-2 text-sm font-semibold text-gray-700">
                  {item.summary}
                </p>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-gray-500">
                  {item.content}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function PasswordChangePanel({ mode }: { mode: AppMode }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState("");
  const changePassword = useMutation({
    mutationFn: () => api.changePassword(currentPassword, newPassword),
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setFormError("");
    },
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError("");
    const minimumLength = mode === "local" ? 4 : 8;
    if (newPassword.length < minimumLength) {
      setFormError(`새 비밀번호는 ${minimumLength}자 이상으로 입력해 주세요.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setFormError("새 비밀번호가 일치하지 않습니다.");
      return;
    }
    changePassword.mutate();
  };

  return (
    <form
      onSubmit={submit}
      className="rounded-lg border border-gray-200 bg-white p-5 shadow-panel"
    >
      <span className="grid size-10 place-items-center rounded-lg bg-amber-50 text-amber-700">
        <KeyRound size={20} />
      </span>
      <h2 className="mt-4 font-extrabold">관리자 비밀번호 변경</h2>
      <div className="mt-4 space-y-3">
        <label className="block text-xs font-bold text-gray-600">
          현재 비밀번호
          <input
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            autoComplete="current-password"
            required
            className="mt-1.5 h-10 w-full rounded-md border border-gray-300 px-3 text-sm outline-none focus:border-mint-500 focus:ring-2 focus:ring-mint-100"
          />
        </label>
        <label className="block text-xs font-bold text-gray-600">
          새 비밀번호
          <input
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            autoComplete="new-password"
            minLength={mode === "local" ? 4 : 8}
            required
            className="mt-1.5 h-10 w-full rounded-md border border-gray-300 px-3 text-sm outline-none focus:border-mint-500 focus:ring-2 focus:ring-mint-100"
          />
        </label>
        <label className="block text-xs font-bold text-gray-600">
          새 비밀번호 확인
          <input
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            autoComplete="new-password"
            minLength={mode === "local" ? 4 : 8}
            required
            className="mt-1.5 h-10 w-full rounded-md border border-gray-300 px-3 text-sm outline-none focus:border-mint-500 focus:ring-2 focus:ring-mint-100"
          />
        </label>
      </div>
      <button
        type="submit"
        disabled={changePassword.isPending}
        className="mt-4 flex h-10 items-center gap-2 rounded-md bg-ink px-4 text-sm font-extrabold text-white disabled:opacity-50"
      >
        {changePassword.isPending ? <LoaderCircle size={16} className="animate-spin" /> : <KeyRound size={16} />}
        {changePassword.isPending ? "변경 중" : "비밀번호 변경"}
      </button>
      {(formError || changePassword.isError) && (
        <p className="mt-3 text-xs font-bold text-rose-600">
          {formError || changePassword.error?.message}
        </p>
      )}
      {changePassword.isSuccess && (
        <p className="mt-3 text-xs font-bold text-mint-700">
          {mode === "local"
            ? "이 기기의 로컬 관리자 비밀번호를 변경했습니다."
            : "비밀번호를 변경했습니다. 다른 기기에서는 다시 로그인해 주세요."}
        </p>
      )}
    </form>
  );
}

function PushNotificationPanel() {
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState("");
  const toggle = useMutation({
    mutationFn: async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window))
        throw new Error("이 브라우저에서는 푸시 알림을 지원하지 않습니다.");
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      if (existing) {
        await api.disablePushNotifications(existing.endpoint);
        await existing.unsubscribe();
        return false;
      }
      if (Notification.permission === "denied")
        throw new Error("브라우저 설정에서 알림 권한을 허용해 주세요.");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("알림 권한이 필요합니다.");
      const { publicKey } = await api.pushNotificationConfig();
      const base64Key = publicKey.replace(/-/g, "+").replace(/_/g, "/");
      const applicationServerKey = Uint8Array.from(
        atob(base64Key.padEnd(base64Key.length + ((4 - (base64Key.length % 4)) % 4), "=")),
        (character) => character.charCodeAt(0),
      );
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });
      await api.enablePushNotifications(subscription.toJSON());
      return true;
    },
    onSuccess: (value) => {
      setEnabled(value);
      setMessage(value ? "1시간 전 일정 알림을 켰습니다." : "일정 알림을 껐습니다.");
    },
    onError: (error) => setMessage(error.message),
  });

  useEffect(() => {
    void navigator.serviceWorker?.ready.then(async (registration) => {
      setEnabled(Boolean(await registration.pushManager.getSubscription()));
    });
  }, []);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-panel">
      <span className="grid size-10 place-items-center rounded-lg bg-sky-50 text-sky-700">
        <Bell size={20} />
      </span>
      <h2 className="mt-4 font-extrabold">상담 일정 알림</h2>
      <p className="mt-1 text-sm leading-6 text-gray-500">
        상담 1시간 전에 이 기기로 알림을 보냅니다. 학생 이름과 상담 내용은 알림에 포함하지 않습니다.
      </p>
      <button
        onClick={() => { setMessage(""); toggle.mutate(); }}
        disabled={toggle.isPending}
        className="mt-4 flex h-10 items-center gap-2 rounded-md bg-mint-600 px-4 text-sm font-extrabold text-white disabled:opacity-50"
      >
        {toggle.isPending ? <LoaderCircle size={16} className="animate-spin" /> : <Bell size={16} />}
        {enabled ? "알림 끄기" : "1시간 전 알림 켜기"}
      </button>
      {message && (
        <p className={`mt-3 text-xs font-bold ${toggle.isError ? "text-rose-600" : "text-mint-700"}`}>
          {message}
        </p>
      )}
    </div>
  );
}

function SettingsCore({ mode }: { mode: AppMode }) {
  const queryClient = useQueryClient();
  const trash = useQuery({ queryKey: ["trash"], queryFn: api.trash });
  const integrity = useQuery({
    queryKey: ["integrity"],
    queryFn: api.integrity,
    enabled: false,
  });
  const restoreStudent = useMutation({
    mutationFn: api.restoreStudent,
    onSuccess: () => queryClient.invalidateQueries(),
  });
  const restoreCounseling = useMutation({
    mutationFn: api.restoreCounseling,
    onSuccess: () => queryClient.invalidateQueries(),
  });
  const backup = useMutation({
    mutationFn: api.downloadBackup,
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `마음잇기_백업_${new Date().toLocaleDateString("en-CA")}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    },
  });
  return (
    <div className="mx-auto w-full max-w-[1000px] px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-10 lg:pt-8">
      <header>
        <p className="text-sm font-bold text-mint-700">안전한 데이터 관리</p>
        <h1 className="mt-1 text-3xl font-extrabold">설정</h1>
      </header>
      <section className="mt-6 grid gap-4 sm:grid-cols-2">
        <PasswordChangePanel mode={mode} />
        {mode === "cloud" && <PushNotificationPanel />}
        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-panel">
          <span className="grid size-10 place-items-center rounded-lg bg-sky-50 text-sky-700">
            <Download size={20} />
          </span>
          <h2 className="mt-4 font-extrabold">JSON 백업</h2>
          <p className="mt-1 text-sm leading-6 text-gray-500">
            학생, 학적, 상담, 일정 전체를 내려받습니다.
          </p>
          <button
            onClick={() => backup.mutate()}
            disabled={backup.isPending}
            className="mt-4 flex h-10 items-center gap-2 rounded-md bg-ink px-4 text-sm font-extrabold text-white disabled:opacity-50"
          >
            {backup.isPending ? (
              <LoaderCircle size={16} className="animate-spin" />
            ) : (
              <Download size={16} />
            )}
            {backup.isPending
              ? "백업 생성 중"
              : backup.isSuccess
                ? "백업 다시 받기"
                : "백업 파일 받기"}
          </button>
          {backup.isSuccess && (
            <p className="mt-3 text-xs font-bold text-mint-700">
              백업 파일을 내려받았습니다.
            </p>
          )}
          {backup.isError && (
            <p className="mt-3 text-xs font-bold text-rose-600">
              {backup.error.message}
            </p>
          )}
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-panel">
          <span className="grid size-10 place-items-center rounded-lg bg-mint-50 text-mint-700">
            <Database size={20} />
          </span>
          <h2 className="mt-4 font-extrabold">데이터 무결성 검사</h2>
          <p className="mt-1 text-sm leading-6 text-gray-500">
            연결이 끊긴 기록과 학적 누락을 확인합니다.
          </p>
          <button
            onClick={() => integrity.refetch()}
            className="mt-4 flex h-10 items-center gap-2 rounded-md bg-mint-600 px-4 text-sm font-extrabold text-white"
          >
            <ShieldCheck size={16} /> 검사 실행
          </button>
          {integrity.data && (
            <p
              className={`mt-3 text-sm font-bold ${integrity.data.healthy ? "text-mint-700" : "text-rose-600"}`}
            >
              {integrity.data.healthy
                ? "모든 데이터가 정상입니다."
                : `확인이 필요한 항목 ${Object.values(integrity.data.issues).reduce((a, b) => a + b, 0)}건`}
            </p>
          )}
        </div>
      </section>
      <section className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-panel">
        <div className="flex h-16 items-center justify-between border-b border-gray-100 px-5">
          <div className="flex items-center gap-2">
            <Trash2 size={18} className="text-gray-500" />
            <h2 className="font-extrabold">휴지통</h2>
          </div>
          <span className="text-xs font-bold text-gray-500">
            항목별 복원 가능
          </span>
        </div>
        <ul className="divide-y divide-gray-100">
          {trash.data?.students.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-3 px-5 py-4"
            >
              <div>
                <p className="text-sm font-extrabold">
                  {maskStudentName(item.name)}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  삭제된 학생 · {item.deleted_at.slice(0, 10)}
                </p>
              </div>
              <button
                onClick={() => restoreStudent.mutate(item.id)}
                className="grid size-9 place-items-center rounded-md text-mint-700 hover:bg-mint-50"
                title="학생 복원"
              >
                <RotateCcw size={17} />
              </button>
            </li>
          ))}
          {trash.data?.counseling.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-3 px-5 py-4"
            >
              <div>
                <p className="text-sm font-extrabold">
                  {maskStudentName(item.student_name)} 상담
                </p>
                <p className="mt-1 line-clamp-1 text-xs text-gray-500">
                  {item.summary}
                </p>
              </div>
              <button
                onClick={() => restoreCounseling.mutate(item.id)}
                className="grid size-9 place-items-center rounded-md text-mint-700 hover:bg-mint-50"
                title="상담 기록 복원"
              >
                <RotateCcw size={17} />
              </button>
            </li>
          ))}
        </ul>
        {trash.data &&
          !trash.data.students.length &&
          !trash.data.counseling.length && (
            <div className="grid min-h-32 place-items-center text-sm font-semibold text-gray-500">
              휴지통이 비어 있습니다.
            </div>
          )}
      </section>
    </div>
  );
}

function RestorePanel() {
  const queryClient = useQueryClient();
  const [backupFile, setBackupFile] = useState<unknown>(null);
  const [fileName, setFileName] = useState("");
  const [readError, setReadError] = useState("");
  const isLegacy = (value: unknown) =>
    typeof value === "object" &&
    value !== null &&
    !("format" in value) &&
    "students" in value;
  const validate = useMutation({
    mutationFn: (value: unknown) =>
      isLegacy(value) ? api.validateV1Import(value) : api.validateBackup(value),
  });
  const restore = useMutation({
    mutationFn: (value: unknown) =>
      isLegacy(value) ? api.importV1(value) : api.restoreBackup(value),
    onSuccess: () => queryClient.invalidateQueries(),
  });
  const readFile = async (file?: File) => {
    setReadError("");
    setBackupFile(null);
    validate.reset();
    restore.reset();
    if (!file) return;
    setFileName(file.name);
    try {
      const parsed: unknown = JSON.parse(await file.text());
      setBackupFile(parsed);
      if (isLegacy(parsed)) setFileName(`V1 가져오기 · ${file.name}`);
      validate.mutate(parsed);
    } catch {
      setReadError("JSON 백업 파일을 읽을 수 없습니다.");
    }
  };
  return (
    <section className="mx-auto mb-28 mt-[-80px] w-[calc(100%-2rem)] max-w-[968px] rounded-lg border border-gray-200 bg-white p-5 shadow-panel sm:mt-[-72px] lg:mb-10">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-amber-50 text-amber-700">
          <RotateCcw size={20} />
        </span>
        <div>
          <h2 className="font-extrabold">백업 복원</h2>
          <p className="mt-1 text-sm leading-6 text-gray-500">
            파일을 먼저 검사합니다. 복원 직전의 현재 데이터는 서버 스냅샷으로
            자동 보관됩니다.
          </p>
        </div>
      </div>
      <label className="mt-4 flex min-h-11 cursor-pointer items-center justify-center rounded-md border border-dashed border-gray-300 px-4 text-sm font-bold text-gray-600 hover:bg-gray-50">
        <input
          type="file"
          accept="application/json,.json"
          className="sr-only"
          onChange={(e) => readFile(e.target.files?.[0])}
        />
        {fileName || "JSON 백업 파일 선택"}
      </label>
      {validate.isPending && (
        <p className="mt-3 text-sm font-semibold text-gray-500">
          백업 구조를 검사하고 있습니다.
        </p>
      )}
      {validate.data && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-md bg-mint-50 px-4 py-3">
          <p className="text-sm font-bold text-mint-800">
            검사 완료 · 학생 {validate.data.counts.students ?? 0}명 · 상담{" "}
            {validate.data.counts.counselingRecords ?? 0}건
          </p>
          <button
            onClick={() => backupFile && restore.mutate(backupFile)}
            disabled={restore.isPending || restore.isSuccess}
            className="h-9 rounded-md bg-mint-700 px-4 text-xs font-extrabold text-white disabled:opacity-50"
          >
            {restore.isSuccess
              ? "복원 완료"
              : restore.isPending
                ? "복원 중"
                : "검사된 백업 복원"}
          </button>
        </div>
      )}
      {(readError || validate.isError || restore.isError) && (
        <p className="mt-3 text-sm font-semibold text-rose-600">
          {readError || validate.error?.message || restore.error?.message}
        </p>
      )}
    </section>
  );
}

function saveDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function DataModePanel({
  mode,
  changed,
}: {
  mode: AppMode;
  changed: (mode: AppMode) => void;
}) {
  const [cloudExportId, setCloudExportId] = useState("");
  const [backupConfirmed, setBackupConfirmed] = useState(false);
  const cloudToLocal = useMutation({
    mutationFn: async () => {
      const bundle = await downloadCloudBackup();
      saveDownload(
        bundle.blob,
        `마음잇기_클라우드_백업_${new Date().toLocaleDateString("en-CA")}.json`,
      );
      await importLocalBackup(bundle.backup);
      return bundle.exportId;
    },
    onSuccess: (exportId) => {
      setCloudExportId(exportId);
      setBackupConfirmed(false);
    },
  });
  const purge = useMutation({
    mutationFn: () => purgeCloudData(cloudExportId),
    onSuccess: () => changed("local"),
  });
  const localToCloud = useMutation({
    mutationFn: async () => uploadBackupToCloud(await localBackup()),
    onSuccess: () => changed("cloud"),
  });
  const downloadLocal = useMutation({
    mutationFn: async () => {
      const backup = await localBackup();
      saveDownload(
        new Blob([JSON.stringify(backup, null, 2)], {
          type: "application/json",
        }),
        `마음잇기_로컬_백업_${new Date().toLocaleDateString("en-CA")}.json`,
      );
    },
  });

  return (
    <section className="mx-auto w-full max-w-[1000px] px-4 pt-6 sm:px-6 lg:px-8 lg:pt-8">
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-panel">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-lg bg-mint-50 text-mint-700">
              <Database size={20} />
            </span>
            <div>
              <p className="text-sm font-extrabold text-mint-700">
                데이터 저장 위치
              </p>
              <h2 className="font-extrabold">
                {mode === "cloud"
                  ? "DB 모드 · 클라우드 D1"
                  : "로컬 모드 · 이 기기 IndexedDB"}
              </h2>
            </div>
          </div>
          <span className="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-extrabold text-gray-700">
            {mode === "cloud" ? "온라인" : "오프라인 가능"}
          </span>
        </div>
        {mode === "cloud" ? (
          <div className="grid gap-5 p-5 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <h3 className="font-extrabold">클라우드 자료를 로컬로 옮기기</h3>
              <p className="mt-1 text-sm leading-6 text-gray-500">
                백업 파일을 먼저 내려받고 이 기기의 로컬 DB에 복사합니다.
              </p>
              {cloudToLocal.isSuccess && (
                <label className="mt-4 flex items-center gap-2 text-sm font-bold text-gray-700">
                  <input
                    type="checkbox"
                    checked={backupConfirmed}
                    onChange={(event) =>
                      setBackupConfirmed(event.target.checked)
                    }
                    className="size-4 accent-mint-600"
                  />
                  다운로드한 백업 파일을 별도 보관했습니다
                </label>
              )}
              {(cloudToLocal.isError || purge.isError) && (
                <p className="mt-3 text-sm font-semibold text-rose-600">
                  {cloudToLocal.error?.message ?? purge.error?.message}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => cloudToLocal.mutate()}
                disabled={cloudToLocal.isPending || purge.isPending}
                className="flex h-10 items-center gap-2 rounded-md bg-ink px-4 text-sm font-extrabold text-white disabled:opacity-50"
              >
                <Download size={16} />
                {cloudToLocal.isPending ? "백업 중" : "백업 후 로컬 저장"}
              </button>
              <button
                onClick={() => purge.mutate()}
                disabled={!cloudExportId || !backupConfirmed || purge.isPending}
                className="flex h-10 items-center gap-2 rounded-md bg-rose-600 px-4 text-sm font-extrabold text-white disabled:opacity-40"
              >
                <Trash2 size={16} />
                {purge.isPending
                  ? "삭제 중"
                  : "클라우드 자료 삭제 후 로컬 모드"}
              </button>
            </div>
          </div>
        ) : (
          <div className="grid gap-5 p-5 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <h3 className="font-extrabold">로컬 자료를 DB 모드로 업로드</h3>
              <p className="mt-1 text-sm leading-6 text-gray-500">
                이 기기의 자료를 클라우드 DB에 안전하게 병합합니다. 로컬 자료는
                그대로 남습니다.
              </p>
              {(localToCloud.isError || downloadLocal.isError) && (
                <p className="mt-3 text-sm font-semibold text-rose-600">
                  {localToCloud.error?.message ?? downloadLocal.error?.message}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => downloadLocal.mutate()}
                disabled={downloadLocal.isPending}
                className="flex h-10 items-center gap-2 rounded-md border border-gray-300 px-4 text-sm font-extrabold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                <Download size={16} /> 로컬 백업
              </button>
              <button
                onClick={() => localToCloud.mutate()}
                disabled={localToCloud.isPending}
                className="flex h-10 items-center gap-2 rounded-md bg-mint-600 px-4 text-sm font-extrabold text-white disabled:opacity-50"
              >
                <Upload size={16} />
                {localToCloud.isPending ? "업로드 중" : "DB 모드로 업로드"}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function SettingsPage({
  mode,
  changed,
}: {
  mode: AppMode;
  changed: (mode: AppMode) => void;
}) {
  return (
    <>
      <DataModePanel mode={mode} changed={changed} />
      <SettingsCore mode={mode} />
      <RestorePanel />
    </>
  );
}

export function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [appMode, setCurrentAppMode] = useState<AppMode>(getAppMode);
  const queryClient = useQueryClient();
  const pwa = usePwa();
  const changeMode = (mode: AppMode) => {
    setAppMode(mode);
    queryClient.clear();
    setCurrentAppMode(mode);
  };
  useEffect(() => {
    const syncMode = () => setCurrentAppMode(getAppMode());
    window.addEventListener("student-counseling-mode-change", syncMode);
    return () =>
      window.removeEventListener("student-counseling-mode-change", syncMode);
  }, []);
  const currentUser = useQuery({
    queryKey: ["me", appMode],
    queryFn: api.me,
    retry: false,
  });
  const logout = useMutation({
    mutationFn: api.logout,
    onSuccess: () => queryClient.resetQueries({ queryKey: ["me"] }),
  });

  if (currentUser.isPending) {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-white">
        <div className="flex flex-col items-center gap-4">
          <Brand />
          <LoaderCircle className="animate-spin text-mint-600" />
        </div>
      </div>
    );
  }

  if (currentUser.isError) {
    return (
      <LoginScreen
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ["me"] })}
        startLocal={() => changeMode("local")}
        startCloud={() => changeMode("cloud")}
        mode={appMode}
        pwa={pwa}
      />
    );
  }

  return (
    <div className="min-h-screen bg-canvas">
      <Sidebar
        open={menuOpen}
        close={() => setMenuOpen(false)}
        user={currentUser.data}
        logout={() => logout.mutate()}
        openGuide={() => setGuideOpen(true)}
      />
      <div className="lg:pl-64">
        <div className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-gray-200 bg-white/95 px-4 backdrop-blur lg:hidden">
          <Brand />
          <button
            className="grid size-10 place-items-center rounded-md text-gray-600 hover:bg-gray-100"
            onClick={() => setMenuOpen(true)}
            title="메뉴 열기"
          >
            <Menu size={22} />
          </button>
        </div>
        <main>
          <Routes>
            <Route
              path="/"
              element={
                <Dashboard
                  openQuickCounseling={() => setQuickOpen(true)}
                  pwa={pwa}
                />
              }
            />
            <Route path="/students" element={<StudentPage />} />
            <Route
              path="/counseling"
              element={
                <CounselingPage
                  openQuickCounseling={() => setQuickOpen(true)}
                />
              }
            />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route
              path="/settings"
              element={<SettingsPage mode={appMode} changed={changeMode} />}
            />
          </Routes>
        </main>
        <nav
          className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-gray-200 bg-white px-2 pb-[env(safe-area-inset-bottom)] lg:hidden"
          aria-label="모바일 메뉴"
        >
          {navigation.map(({ label, to, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-bold ${isActive ? "text-mint-700" : "text-gray-500"}`
              }
            >
              <Icon size={21} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
      {quickOpen && <QuickCounseling close={() => setQuickOpen(false)} />}
      {guideOpen && <UserGuide close={() => setGuideOpen(false)} />}
    </div>
  );
}
