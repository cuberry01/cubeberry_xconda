"use client";

import { FormEvent, useState } from "react";

const loginUrl = "https://accounts.google.com/AccountChooser?continue=https%3A%2F%2Fdocs.google.com%2Fvideos%2Fcreate%3Fusp%3Dmkt_vids%26service%3Dwise%26flowName%3DGlifWebSignIn%26flowEntry%3DAccountChooser";
const createUrl = "https://docs.google.com/videos/create?utm_source=website&utm_medium=mkt_page&utm_campaign=freemium+avatars&usp=mkt_vids";

const useCases = [
  {
    key: "support",
    label: "고객 지원",
    icon: "person",
    color: "blue",
    title: "고객과 팀을 위한 정보를 더욱 쉽게 전달하세요.",
    body: "Google Vids 녹화 스튜디오에서 화면을 간단하게 공유하고 필요한 내용을 설명해 보세요. 복잡한 회의 없이도 고객과 팀을 대규모로 교육할 수 있습니다.",
  },
  {
    key: "sales",
    label: "영업",
    icon: "trend",
    color: "green",
    title: "더 설득력 있는 피치로 더 많은 거래를 성사시키세요.",
    body: "AI 아바타 또는 내레이션을 사용하여 슬라이드를 매력적인 동영상 피치로 즉시 전환하고 청중의 관심을 사로잡으세요.",
  },
  {
    key: "marketing",
    label: "마케팅",
    icon: "spark",
    color: "purple",
    title: "아이디어를 역동적이고 흥미로운 콘텐츠로 바꿔보세요.",
    body: "Google Vids 콘텐츠 라이브러리에서 제공하는 로열티 없는 수백만 개의 고화질 미디어 애셋을 활용하여 브랜드의 이야기를 전달하세요.",
  },
  {
    key: "people",
    label: "인사 관리 및 교육",
    icon: "people",
    color: "orange",
    title: "온보딩과 교육을 더욱 흥미롭게 만드세요.",
    body: "Google Slides 또는 사전 제작된 템플릿으로 시작하고 AI 아바타와 내레이션을 추가하세요. 24개 언어로 콘텐츠를 확장할 수 있습니다.",
  },
] as const;

const faqs = [
  {
    question: "액세스하려면 어떻게 해야 하나요?",
    answer: (
      <>
        Google Vids는 무료로 사용해 볼 수 있습니다. Google 계정에 로그인하여 시작하세요. Workspace 요금제를 사용하는 비즈니스 사용자와 Google AI 요금제를 사용하는 소비자는 고급 기능과 확장된 사용량 한도를 이용할 수 있습니다.
      </>
    ),
  },
  {
    question: "Google Vids 사용 방법은 어떻게 배우나요?",
    answer: (
      <>
        Google Workspace 학습 센터에서 언제든지 이용할 수 있는 리소스를 확인하거나 YouTube의 ‘Vids on Vids’ 교육 시리즈를 시청해 보세요. 처음 시작하는 분도 빠르게 나만의 동영상을 만들 수 있습니다.
      </>
    ),
  },
  {
    question: "제작할 수 있는 동영상에 시간 제한이 있나요?",
    answer: <>예. 시청자의 참여를 극대화하기 위해 각 동영상의 길이는 최대 30분까지 허용됩니다.</>,
  },
  {
    question: "Google Vids는 여러 가로세로 비율을 지원하나요?",
    answer: <>와이드스크린, 세로, 정사각형 가로세로 비율의 동영상 제작을 지원합니다. 목적에 맞는 형식으로 콘텐츠를 만들어 보세요.</>,
  },
  {
    question: "Google Vids는 어떤 언어를 지원하나요?",
    answer: <>24개 언어로 AI 아바타와 내레이션 스크립트를 작성할 수 있습니다. 다국어 스크립트 작성 및 자막 생성으로 전 세계 시청자에게 도달해 보세요.</>,
  },
  {
    question: "Google Vids는 데스크톱과 휴대기기에서 사용할 수 있나요?",
    answer: <>현재 Google Vids 제작 및 편집은 데스크톱에서만 가능하며, 동영상 보기는 데스크톱과 휴대기기 모두에서 가능합니다.</>,
  },
];

function Arrow({ right = true }: { right?: boolean }) {
  return (
    <svg className={right ? "arrow-icon" : "arrow-icon arrow-left"} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h13M13 6l6 6-6 6" />
    </svg>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg className={`chevron ${open ? "is-open" : ""}`} viewBox="0 0 24 24" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function VidsMark({ large = false }: { large?: boolean }) {
  return (
    <span className={`vids-mark ${large ? "vids-mark-large" : ""}`} aria-hidden="true">
      <span className="vids-mark-dot dot-a" />
      <span className="vids-mark-dot dot-b" />
      <span className="vids-mark-dot dot-c" />
      <span className="vids-mark-dot dot-d" />
      <span className="vids-mark-play" />
    </span>
  );
}

function GoogleWorkspaceLogo() {
  return (
    <a href="#top" className="workspace-logo" aria-label="Google Workspace 홈">
      <span className="google-g" aria-hidden="true">G</span>
      <span>Google Workspace</span>
    </a>
  );
}

function ProductGlyph({ type }: { type: string }) {
  if (type === "person") {
    return <span className="case-glyph"><span className="glyph-head" /><span className="glyph-body" /></span>;
  }
  if (type === "trend") {
    return <span className="case-glyph trend-glyph"><span /><span /><span /></span>;
  }
  if (type === "spark") {
    return <span className="case-glyph spark-glyph">✦</span>;
  }
  return <span className="case-glyph people-glyph"><span /><span /><span /></span>;
}

function BrowserDots() {
  return (
    <div className="browser-dots" aria-hidden="true">
      <i /><i /><i />
    </div>
  );
}

function EditorMockup({ variant = "hero" }: { variant?: "hero" | "templates" | "script" | "share" | "gemini" }) {
  if (variant === "gemini") {
    return (
      <div className="gemini-mockup" aria-label="Gemini로 동영상 클립을 생성하는 화면">
        <div className="gemini-toolbar"><BrowserDots /><span className="mini-pill">Vids</span><span className="toolbar-spacer" /><span className="toolbar-avatar">S</span></div>
        <div className="gemini-body">
          <div className="gemini-sidebar"><b>새 동영상</b><span>홈</span><span>내 프로젝트</span><span>템플릿</span><span>미디어</span></div>
          <div className="gemini-content">
            <div className="gemini-label"><span className="sparkle">✦</span> Gemini로 만들기</div>
            <div className="gemini-title">무엇을 만들어 볼까요?</div>
            <div className="prompt-card"><span>도시 위로 떠오르는 일출과 함께 시작하는 브랜드 스토리</span><button>생성</button></div>
            <div className="gemini-options"><span>가로세로 비율 <b>16:9⌄</b></span><span>스타일 <b>시네마틱⌄</b></span></div>
            <div className="generated-row"><div className="generated-card generated-one"><span>✦</span></div><div className="generated-card generated-two"><span>▶</span></div><div className="generated-card generated-three"><span>✦</span></div></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`editor-mockup editor-${variant}`} aria-label="Google Vids 동영상 편집기 화면">
      <div className="editor-topbar"><BrowserDots /><span className="editor-file">신제품 출시 안내</span><span className="saved">저장됨</span><span className="toolbar-spacer" /><span className="top-action">공유</span><span className="top-avatar">J</span></div>
      <div className="editor-main">
        <aside className="editor-sidebar"><div className="side-brand"><VidsMark /><b>Vids</b></div><span className="side-active">▣ 장면</span><span>▤ 스크립트</span><span>♫ 오디오</span><span>◉ 녹화</span><span>✦ Gemini</span></aside>
        <div className="editor-workspace">
          {variant === "templates" ? (
            <><div className="template-heading">템플릿으로 빠르게 시작하세요</div><div className="template-sub">아이디어에 딱 맞는 디자인을 선택해 보세요.</div><div className="template-grid"><div className="template-tile tile-sky"><b>제품 소개</b><span>새로운 시작</span></div><div className="template-tile tile-lilac"><b>팀 업데이트</b><span>함께 만드는 미래</span></div><div className="template-tile tile-peach"><b>교육 영상</b><span>쉽게 배우기</span></div><div className="template-tile tile-green"><b>브랜드 스토리</b><span>당신의 이야기</span></div></div></>
          ) : (
            <><div className="scene-canvas"><div className="canvas-gradient" /><div className="canvas-shape shape-one" /><div className="canvas-shape shape-two" /><div className="canvas-copy"><small>새로운 아이디어를</small><strong>이야기로<br />만들어 보세요</strong><span>팀과 함께 더 빠르게</span></div><div className="presenter-chip"><span className="presenter-face" /> Gemini 발표자</div></div><div className="workspace-controls"><span>‹</span><b>1 / 4</b><span>›</span><div className="control-spacer" /><span>⛶</span><button>▶</button></div></>
          )}
          <div className="timeline"><span className="timeline-time">00:00</span><div className="timeline-track"><div className="track-block block-blue" /><div className="track-block block-pink" /><div className="track-block block-yellow" /></div><span className="timeline-time">00:30</span></div>
        </div>
      </div>
    </div>
  );
}

function RecordingMockup() {
  return (
    <div className="recording-mockup" aria-label="화면 녹화와 발표자 화면이 있는 Google Vids">
      <div className="recording-header"><span className="rec-dot" /> 화면 녹화 <span className="recording-close">×</span></div>
      <div className="recording-stage"><div className="website-window"><div className="website-nav" /><div className="website-hero"><span /><span /><span /></div><div className="website-lines"><i /><i /><i /></div></div><div className="camera-bubble"><div className="camera-person"><span className="camera-head" /><span className="camera-shirt" /></div><small>내 카메라</small></div></div>
      <div className="recording-controls"><span>🎙</span><span>▣</span><span>▰</span><b>■ 녹화 중지</b></div>
    </div>
  );
}

function ScriptMockup() {
  return (
    <div className="script-mockup" aria-label="스크립트로 동영상을 편집하는 화면">
      <div className="script-preview"><div className="script-photo"><div className="city-sun" /><div className="city-line city-a" /><div className="city-line city-b" /><div className="city-line city-c" /></div><div className="subtitle">함께 더 멀리 나아갑니다</div><span className="play-button">▶</span></div>
      <div className="script-panel"><div className="panel-title">스크립트 <span>•••</span></div><p><mark>새로운 아이디어는</mark> 함께할 때 더 큰 이야기가 됩니다.</p><p>팀의 목소리를 담아 쉽고 빠르게 전달해 보세요.</p><div className="script-tools"><span>◉</span><span>♫</span><span>✦</span><button>자막</button></div></div>
    </div>
  );
}

function ShareMockup() {
  return (
    <div className="share-mockup" aria-label="동영상 공유 설정 화면">
      <div className="share-video"><div className="share-mountain" /><div className="share-play">▶</div><span>00:42</span></div>
      <div className="share-dialog"><div className="share-title">동영상 공유 <span>×</span></div><div className="share-input"><span className="share-user">J</span><span>팀원 또는 이메일 추가</span><button>전송</button></div><div className="share-access"><span className="globe">◎</span><div><b>링크가 있는 모든 사용자</b><small>보기 가능</small></div><span>⌄</span></div><div className="share-link">🔗 링크 복사</div></div>
    </div>
  );
}

export default function Home() {
  const [activeCase, setActiveCase] = useState<(typeof useCases)[number]["key"]>("support");
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const selectedCase = useCases.find((item) => item.key === activeCase) ?? useCases[0];

  function handleNewsletter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
  }

  return (
    <div className="vids-page" id="top">
      <header className="vids-header">
        <div className="header-inner">
          <GoogleWorkspaceLogo />
          <nav className={`main-nav ${mobileOpen ? "mobile-open" : ""}`} aria-label="주요 메뉴">
            <a href="#vids-use-cases" onClick={() => setMobileOpen(false)}>솔루션 <span>⌄</span></a>
            <a href="#vids-create" onClick={() => setMobileOpen(false)}>제품 <span>⌄</span></a>
            <a href="#vids-faqs" onClick={() => setMobileOpen(false)}>리소스 <span>⌄</span></a>
            <a href="#newsletter" onClick={() => setMobileOpen(false)}>요금제</a>
          </nav>
          <div className="header-actions"><a href="#" className="language">한국어 <span>⌄</span></a><a href={loginUrl} className="header-login">로그인</a><a href="#business" className="header-try">무료 체험</a></div>
          <button className="mobile-menu" aria-label="메뉴 열기" aria-expanded={mobileOpen} onClick={() => setMobileOpen((value) => !value)}><span /><span /><span /></button>
        </div>
      </header>

      <div className="announcement"><span className="announcement-spark">✦</span><b>Google Vids에서 AI 아바타와 음성 해설을 무료로 사용해 보세요</b><a href={createUrl}>지금 사용해 보기 <Arrow /></a></div>

      <main>
        <section className="hero-section">
          <div className="hero-inner">
            <div className="hero-copy">
              <div className="product-lockup"><VidsMark large /><span>Google Vids</span></div>
              <h1>업무용 <span>AI 생성</span><br />동영상 제작 도구</h1>
              <p className="hero-description">간편하고 협업이 가능한 Gemini 기반의 동영상 제작 도구로 더욱 흥미로운 스토리를 전달할 수 있습니다.</p>
              <div className="hero-buttons"><a className="button button-blue" href="#business">업무에 Google Vids 사용해 보기 <Arrow /></a><a className="button button-outline" href={loginUrl}>Google Vids에 로그인</a></div>
              <p className="hero-note"><span className="desktop-icon">▣</span> 데스크톱에서 <b>vids.new</b>를 통해 이용 가능합니다.</p>
            </div>
            <div className="hero-art"><div className="hero-glow" /><EditorMockup /><div className="floating-ai-card"><span className="floating-spark">✦</span><div><b>Gemini가 초안을 만들었어요</b><small>스크립트 · 장면 · 음악 추가</small></div><span className="floating-check">✓</span></div><div className="floating-play-card"><span>▶</span><b>미리보기</b></div></div>
          </div>
          <div className="hero-scroll"><span>스크롤하여 더 알아보기</span><span className="scroll-line" /></div>
        </section>

        <nav className="section-nav" aria-label="Google Vids 페이지 메뉴"><div className="section-nav-inner"><a href="#vids-use-cases">사용 사례</a><a href="#vids-create">만들기</a><a href="#generate">생성</a><a href="#vids-collaborate">공동작업</a><a href="#vids-faqs">FAQ</a><a href={createUrl} className="section-nav-cta">무료로 사용해 보기 <Arrow /></a></div></nav>

        <section className="use-cases section-block" id="vids-use-cases">
          <div className="section-heading centered"><p className="eyebrow">GOOGLE VIDS 활용하기</p><h2>Google Vids를 사용하면<br /><span>동영상 스토리텔링</span>을 통해 메시지를 확장할 수 있습니다</h2></div>
          <div className="case-tabs" role="tablist" aria-label="사용 사례">
            {useCases.map((item) => <button key={item.key} className={`case-tab ${activeCase === item.key ? "active" : ""}`} onClick={() => setActiveCase(item.key)} role="tab" aria-selected={activeCase === item.key}><ProductGlyph type={item.icon} /><span>{item.label}</span></button>)}
          </div>
          <div className={`case-feature case-${selectedCase.color}`}>
            <div className="case-copy"><div className="case-icon-wrap"><ProductGlyph type={selectedCase.icon} /></div><h3>{selectedCase.title}</h3><p>{selectedCase.body}</p><a href="#vids-create" className="text-link">더 알아보기 <Arrow /></a></div>
            <div className="case-art"><div className="case-art-orb orb-one" /><div className="case-art-orb orb-two" /><div className="case-art-window"><div className="case-window-top"><span /><span /><span /></div><div className="case-window-image"><div className="case-person-shape" /><div className="case-window-lines"><i /><i /><i /></div></div><div className="case-window-caption"><b>{selectedCase.label}</b><span>Google Vids로 만든 스토리</span></div></div><div className="case-quote">✦ <span>이야기를 더 크게<br /><b>확장해 보세요</b></span></div></div>
          </div>
        </section>

        <section className="create-section section-block" id="vids-create">
          <div className="section-heading centered"><p className="eyebrow">쉽게 시작하기</p><h2>경험 없이도<br /><span>동영상을 만들어 보세요</span></h2><p>Google Vids는 생각했던 것보다 더 빠르게 제작을 시작할 수 있는 다양한 방법을 제공합니다.</p></div>
          <div className="create-feature"><div className="create-copy"><span className="feature-number">01</span><h3>더 빠르게 초안 생성</h3><p>전문 템플릿과 스톡 미디어를 사용해 동영상 제작을 빠르게 시작하거나 Google Slides 통합을 통해 프레젠테이션을 동영상으로 변환할 수 있습니다.</p><a href={createUrl} className="text-link">템플릿 둘러보기 <Arrow /></a></div><div className="create-art"><EditorMockup variant="templates" /><div className="art-label label-templates">전문 템플릿 <span>✦</span></div></div></div>
          <div className="create-feature reverse"><div className="create-copy"><span className="feature-number">02</span><h3>안심하고 만드세요</h3><p>직접 화면을 녹화하고 오디오를 녹음하거나, AI에게 동영상, 음악, 아바타, 내레이션을 생성하도록 맡겨 보세요. 카메라가 없어도 괜찮습니다.</p><a href="#generate" className="text-link">녹화 기능 알아보기 <Arrow /></a></div><div className="create-art"><RecordingMockup /><div className="art-label label-recording"><span className="rec-dot" /> 간편한 화면 녹화</div></div></div>
          <div className="create-feature"><div className="create-copy"><span className="feature-number">03</span><h3>편집 기술이 없어도 걱정하지 마세요</h3><p>복잡한 타임라인은 건너뛰세요. 문서를 수정하듯이 텍스트 스크립트를 수정하여 동영상을 편집한 다음 클릭 몇 번으로 자막과 매끄러운 전환을 추가할 수 있습니다.</p><a href="#vids-collaborate" className="text-link">편집 기능 알아보기 <Arrow /></a></div><div className="create-art"><ScriptMockup /><div className="art-label label-script">텍스트로 간편하게 편집</div></div></div>
          <div className="create-feature reverse last-feature"><div className="create-copy"><span className="feature-number">04</span><h3>전 세계에 선보이세요</h3><p>추가 촬영 없이 모든 지역에 맞게 콘텐츠를 현지화하세요. 24개 언어로 제공되는 자동 스크립트 작성, AI 아바타, 내레이션을 사용하여 전 세계 시청자에게 도달할 수 있습니다.</p><a href="#vids-faqs" className="text-link">언어 지원 알아보기 <Arrow /></a></div><div className="create-art"><div className="localize-mockup"><div className="localize-screen"><div className="localize-avatar"><span className="avatar-head" /><span className="avatar-body" /></div><div className="localize-caption">Welcome to our<br /><b>next chapter.</b></div></div><div className="language-card"><span>文</span><b>日本語</b><small>24개 언어로 번역</small><span className="language-check">✓</span></div></div><div className="art-label label-language">다국어 콘텐츠 <span>◎</span></div></div></div>
        </section>

        <section className="generate-section section-block" id="generate">
          <div className="generate-inner"><div className="generate-copy"><p className="eyebrow light">GEMINI OMNI</p><h2>Google Vids의 Gemini Omni로<br /><span>스토리텔링을 혁신하세요</span></h2><p>AI 프롬프트를 사용해 독창적인 클립을 생성하거나 기존 동영상을 수정하세요. 사실적인 움직임, 기본 오디오, 나만의 맞춤형 아바타로 콘텐츠에 생동감을 더할 수 있습니다.</p><a href={createUrl} className="button button-white">AI로 동영상 만들기 <Arrow /></a></div><div className="generate-art"><div className="generate-orbit orbit-left" /><div className="generate-orbit orbit-right" /><EditorMockup variant="gemini" /></div></div>
          <div className="generate-cards"><article><span className="card-spark">✦</span><h3>간단한 프롬프트로 동영상을 생성하세요.</h3><p>텍스트 프롬프트만 가지고 몇 분 만에 고화질 동영상 클립을 생성할 수 있습니다.</p><a href={createUrl}>텍스트로 생성하기 <Arrow /></a></article><article><span className="card-avatar">◌</span><h3>맞춤설정 가능한 아바타로 메시지를 전달하세요.</h3><p>브랜딩을 추가하고 아바타의 동작을 지시하여 세련된 동영상을 제작할 수 있습니다.</p><a href="#vids-faqs">AI 아바타 알아보기 <Arrow /></a></article><article><span className="card-motion">◈</span><h3>AI로 이미지에 애니메이션을 입히세요.</h3><p>사진이 살아 움직이게 하세요. 이미지에 움직임과 기본 오디오를 추가할 수 있습니다.</p><a href={createUrl}>더 알아보기 <Arrow /></a></article></div>
        </section>

        <section className="collaborate-section section-block" id="vids-collaborate">
          <div className="section-heading centered"><p className="eyebrow">함께 만들고 공유하기</p><h2>더욱 간편하게<br /><span>공동작업하고 공유하세요</span></h2><p>Docs, Sheets, Slides에서 작업하는 방식 그대로 Workspace를 벗어나지 않고도 손쉽게 동영상 프로젝트를 공동으로 작업할 수 있습니다.</p></div>
          <div className="collab-feature"><div className="collab-art"><ShareMockup /><div className="collab-sticker sticker-one">댓글을 남겨 보세요 <span>💬</span></div><div className="collab-sticker sticker-two">안전하게 보호 <span>✦</span></div></div><div className="collab-list"><article className="collab-item active"><span className="collab-icon">↗</span><div><h3>간편한 공유 관리</h3><p>권한을 간편하게 관리하여 동영상 수정, 댓글 달기, 보기 등 사용자가 할 수 있는 작업을 세부적으로 제어할 수 있습니다.</p></div></article><article className="collab-item"><span className="collab-icon">▹</span><div><h3>원활한 시청 및 재생</h3><p>브라우저에서 동영상 시청 시 자동으로 생성된 자막이 지원되므로 모든 사용자가 쉽게 내용을 따라갈 수 있습니다.</p></div></article><article className="collab-item"><span className="collab-icon">✓</span><div><h3>안전하게 보호</h3><p>다른 Workspace와 마찬가지로 콘텐츠는 기본적으로 암호화되며, 개인 정보 보호 설정으로 데이터를 안전하게 보호할 수 있습니다.</p></div></article><article className="collab-item"><span className="collab-icon">▶</span><div><h3>YouTube로 내보내기</h3><p>수동 다운로드는 건너뛰고 Google Vids에서 YouTube로 바로 업로드하세요. 내보낸 동영상은 기본적으로 비공개입니다.</p></div></article></div></div>
        </section>

        <section className="faq-section section-block" id="vids-faqs"><div className="faq-inner"><div className="section-heading"><p className="eyebrow">궁금한 점이 있으신가요?</p><h2>Google Vids에 관해<br /><span>자주 묻는 질문</span></h2><p>FAQ와 리소스를 통해 Google Vids에 대해 자세히 알아보세요.</p></div><div className="faq-list"><button className="faq-expand" onClick={() => setOpenFaq(openFaq === -1 ? 0 : -1)}>{openFaq === -1 ? "모두 접기" : "모두 펼치기"}<Chevron open={openFaq === -1} /></button>{faqs.map((faq, index) => { const open = openFaq === -1 || openFaq === index; return <div className={`faq-item ${open ? "open" : ""}`} key={faq.question}><button onClick={() => setOpenFaq(open ? null : index)} aria-expanded={open}><span>{faq.question}</span><Chevron open={open} /></button><div className="faq-answer"><p>{faq.answer}</p></div></div>; })}</div></div></section>

        <section className="bottom-cta" id="business"><div className="bottom-cta-inner"><VidsMark large /><p className="eyebrow light">일부 요금제에서 사용 가능</p><h2>Google Vids로 제작한 동영상을 통해<br /><span>흥미로운 이야기를 전달하세요</span></h2><div className="hero-buttons"><a className="button button-white" href={loginUrl}>Google Vids에 로그인 <Arrow /></a><a className="button button-transparent" href="#newsletter">업무에 Google Vids 사용해 보기</a></div></div></section>

        <section className="newsletter-section" id="newsletter"><div className="newsletter-inner"><div><p className="eyebrow">GOOGLE WORKSPACE 소식</p><h2>생산성, 공동작업, AI 관련<br />소식을 받아보세요</h2><p>Google Workspace의 최신 제품 소식과 유용한 팁을 이메일로 보내드립니다.</p></div>{submitted ? <div className="newsletter-success"><span>✓</span><b>신청해 주셔서 감사합니다.</b><p>최신 소식을 곧 만나보세요.</p></div> : <form className="newsletter-form" onSubmit={handleNewsletter}><div className="name-fields"><label>이름*<input required placeholder="이름" /></label><label>성*<input required placeholder="성" /></label></div><label>비즈니스 이메일*<input type="email" required placeholder="name@company.com" /></label><label className="checkbox-label"><input type="checkbox" required /><span>Google Workspace 뉴스 및 업데이트 수신에 동의합니다.</span></label><button className="button button-blue" type="submit">구독하기 <Arrow /></button></form>}</div></section>
      </main>

      <footer className="vids-footer"><div className="footer-main"><GoogleWorkspaceLogo /><div className="footer-links"><div><b>제품</b><a href="#vids-create">Google Vids</a><a href="#generate">Gemini</a><a href="#vids-collaborate">공동작업</a></div><div><b>리소스</b><a href="#vids-faqs">도움말 센터</a><a href="#vids-faqs">학습 센터</a><a href="#newsletter">Workspace 소식</a></div><div><b>연결</b><a href={loginUrl}>로그인</a><a href="#business">무료 체험</a><a href="#top">맨 위로 ↑</a></div></div></div><div className="footer-bottom"><span>Google Workspace · Google Vids</span><span>개인정보처리방침　 이용약관</span><span>© 2026 Google LLC</span></div></footer>
    </div>
  );
}
