export default {
  meta: {
    home: "Only Talk - Fast · Secure · Talk Freely",
    download: "Download Only Talk",
    privacy: "Privacy Policy - Only Talk",
    agreement: "Terms of Use - Only Talk",
  },
  common: {
    navHome: "Home",
    navDownload: "Download",
    navPrivacy: "Privacy Policy",
    navAgreement: "Terms",
    footerSlogan: "Fast · Secure · Talk Freely",
    footerCopyright: "© 2026 Only Talk. All rights reserved.",
    githubReleases: "GitHub Releases",
    switchThemeLight: "Switch to light theme",
    switchThemeDark: "Switch to dark theme",
    switchLang: "Switch language",
  },
  home: {
    heroTitle: "Only Talk",
    heroSlogan: "Fast · Secure · Talk Freely",
    heroDesc:
      "A cross-platform instant messaging app built on QUIC and P2P technology, offering real-time chat, audio/video calls, and a Moments plaza - every conversation simple, fast and reliable.",
    downloadNow: "Download Now",
    whyTitle: "Why Only Talk",
    whySubtitle: "Focused on the conversation, we handle the complexity",
    highlights: [
      {
        icon: "⚡",
        title: "Blazing Fast",
        desc: "Built on QUIC long connections and P2P direct links, messages arrive in milliseconds and stay stable on weak networks.",
      },
      {
        icon: "🔒",
        title: "End-to-End Security",
        desc: "TLS-protected links and locally encrypted chat history keep your private data under your control.",
      },
      {
        icon: "📱",
        title: "All Platforms",
        desc: "Windows / Linux desktops and Android mobile - stay connected anywhere, anytime.",
      },
      {
        icon: "📞",
        title: "HD Calls",
        desc: "Built-in WebRTC audio/video calls for one-on-one and group chats, smooth and crystal clear.",
      },
      {
        icon: "🛰️",
        title: "P2P Direct Connect",
        desc: "NAT hole punching and traversal let data travel peer-to-peer without server relay.",
      },
      {
        icon: "🌗",
        title: "Personalized",
        desc: "Light/dark theme and multi-language support - make it yours.",
      },
    ],
    featureTitle: "Features",
    featureSubtitle: "Complete capabilities for messaging, social and security",
    featureGroups: [
      {
        icon: "💬",
        title: "Instant Messaging",
        items: [
          "One-on-one and group conversations",
          "Text, image, file and more message types",
          "Read receipts and message history",
          "Auto-reconnect and message backfill",
        ],
      },
      {
        icon: "🛰️",
        title: "P2P Real-time Communication",
        items: [
          "Low-latency real-time connections over QUIC",
          "NAT hole punching and P2P direct links",
          "Private-mode chats that never touch servers",
          "End-to-end encryption readable only by participants",
        ],
      },
      {
        icon: "🎥",
        title: "Audio/Video Calls",
        items: [
          "WebRTC HD video calls",
          "Image preview and compression",
          "File upload and download",
          "Stable and smooth calls",
        ],
      },
      {
        icon: "🌟",
        title: "Moments Plaza",
        items: [
          "Post photo & text moments to share your life",
          "Friend feed and plaza browsing",
          "Likes and comments",
          "Manage moments on your profile",
        ],
      },
      {
        icon: "👥",
        title: "Account & Social",
        items: [
          "Email-verified sign-up / sign-in",
          "Friend search, add and request management",
          "Group creation, settings and management",
          "Notifications, reminders and blacklist",
        ],
      },
      {
        icon: "🛡️",
        title: "Security & Personalization",
        items: [
          "Locally encrypted chat history (SQLCipher)",
          "One-click light / dark theme",
          "简体中文 / 繁體中文 / English",
          "Isolated data per runtime environment",
        ],
      },
    ],
    stackTitle: "Tech Stack",
    stackSubtitle: "A self-built communication stack, rock solid",
    stack: [
      { name: "Desktop", tech: "Tauri 2 · React 18 · Umi Max · Ant Design" },
      { name: "Mobile", tech: "Vue 3 · Vant · Vite" },
      { name: "Realtime", tech: "QUIC (quinn) · WebRTC" },
      {
        name: "Backend",
        tech: "Rust · Actix-web · PostgreSQL · Redis · MinIO",
      },
      { name: "Security", tech: "TLS · SQLCipher · End-to-end encryption" },
    ],
    ctaTitle: "Start Now",
    ctaDesc: "Pick your platform and start chatting in minutes.",
    viewAllDownloads: "View All Downloads",
  },
  platforms: {
    windows: {
      name: "Windows",
      desc: "Windows 10 / 11 · NSIS installer (.exe)",
    },
    linux: {
      name: "Linux",
      desc: "Debian / Ubuntu · .deb installer / .AppImage",
    },
    android: {
      name: "Android",
      desc: "Android 8+ · APK package (.apk)",
    },
  },
  download: {
    title: "Download Only Talk",
    subtitle: "Pick your platform and start chatting right away",
    notice:
      "Installers are not released yet - the links below are placeholders and will point to real packages once published.",
    clientTitle: "Client Installers",
    viaReleases: "GitHub Releases",
    direct: "Direct Download",
    placeholderDirect: "Direct Link (Placeholder)",
    releasesText: "Visit GitHub Releases for older versions and changelogs",
  },
  legal: {
    notice:
      "This document is a placeholder skeleton; the official text is pending. Please have legal/compliance review and replace the placeholder content before going live.",
    updatedAt: "Last updated",
  },
  privacy: {
    title: "Privacy Policy",
    sections: [
      {
        title: "1. Introduction",
        paras: [
          '[Pending] Welcome to Only Talk ("we"). We take your privacy and the protection of your personal information very seriously. This Privacy Policy explains how we collect, use, store and protect your personal information.',
          "[Pending] Please read this policy carefully before using the product. By using the product, you acknowledge that you have read, understood and agreed to the full policy.",
        ],
      },
      {
        title: "2. Information We Collect",
        paras: [
          "[Pending] Account information: phone number, email, username, avatar provided at registration and sign-in.",
          "[Pending] Device information: device model, OS version, network status and other info needed to keep the service running.",
          "[Pending] Communication information: message content, files and call records transmitted to enable chat (stored locally encrypted).",
        ],
      },
      {
        title: "3. How We Use Information",
        paras: [
          "[Pending] To provide, maintain and improve features such as messaging, friends, groups and the moments plaza.",
          "[Pending] For security and risk control, such as detecting abnormal sign-ins and preventing fraud and abuse.",
          "[Pending] Other purposes with your separate consent.",
        ],
      },
      {
        title: "4. Sharing and Disclosure",
        paras: [
          "[Pending] Except as required by law or with your explicit consent, we do not sell or share your personal information with third parties.",
          "[Pending] We may engage third-party service providers (e.g. storage, push) to process information for specific features, and will require them to comply with this policy and confidentiality obligations.",
        ],
      },
      {
        title: "5. Storage and Security",
        paras: [
          "[Pending] We protect your data with encrypted transmission and storage; retention periods follow applicable law and business needs.",
          "[Pending] You should keep your account and password safe and are responsible for all activity under your account.",
        ],
      },
      {
        title: "6. Your Rights",
        paras: [
          "[Pending] You may access, correct, delete your personal information or close your account.",
          "[Pending] After account closure, we will process your data in accordance with applicable law and this policy.",
        ],
      },
      {
        title: "7. Protection of Minors",
        paras: [
          "[Pending] This product is not intended for minors. If we discover minors' information, we will handle it promptly in accordance with the law.",
        ],
      },
      {
        title: "8. Changes to This Policy",
        paras: [
          "[Pending] We may revise this policy from time to time and will publish the updated version on this page. Material changes will be notified prominently.",
        ],
      },
      {
        title: "9. Contact Us",
        paras: [
          "[Pending] If you have any questions or complaints about this policy, please contact us via the in-app About page or official channels.",
        ],
      },
    ],
  },
  agreement: {
    title: "Terms of Use",
    sections: [
      {
        title: "1. Acceptance of Terms",
        paras: [
          "[Pending] These Terms constitute an agreement between you and Only Talk regarding your use of this product and its services. Please read and understand them carefully before use.",
          "[Pending] By starting to use the product, you are deemed to have read, understood and agreed to all of these Terms.",
        ],
      },
      {
        title: "2. Account Registration and Use",
        paras: [
          "[Pending] You should provide true, accurate and lawful registration information and are responsible for all activity under your account.",
          "[Pending] Accounts are for personal use only and may not be lent, transferred or used for any unlawful purpose.",
          "[Pending] If security risks or violations are found, we may take appropriate action under these Terms.",
        ],
      },
      {
        title: "3. Acceptable Use",
        paras: [
          "[Pending] You agree not to use this product for any unlawful activity or infringement of others' rights, including but not limited to: posting illegal content, harassing others, infringing intellectual property, or distributing malware.",
          "[Pending] You must respect public decency and refrain from any form of harassment, bullying or discrimination.",
        ],
      },
      {
        title: "4. Content and Intellectual Property",
        paras: [
          "[Pending] Content you publish in this product belongs to you or the respective rights holders.",
          "[Pending] The software, interfaces, logos, documentation and related IP of this product belong to us and may not be used without permission.",
        ],
      },
      {
        title: "5. Open Source Repositories",
        paras: [
          "Only Talk is an open-source project. The source code repositories are:",
          "Client (frontend): https://github.com/nicolastinger/only-talk-app",
          "Server (backend): https://github.com/nicolastinger/only-talk-rs",
          "[Pending] Open-source licensing and usage terms follow the LICENSE in the repositories and community norms.",
        ],
      },
      {
        title: "6. Service Interruption and Changes",
        paras: [
          "[Pending] We may change or interrupt some features due to business adjustments or maintenance, and will make reasonable efforts to notify you in advance.",
          "[Pending] To the extent permitted by law, we are not liable for service interruptions caused by force majeure or factors beyond our control.",
        ],
      },
      {
        title: "7. Disclaimer",
        paras: [
          '[Pending] The product is provided on an "as is" basis; we do not guarantee absolute stability or error-free operation.',
          "[Pending] You should judge the accuracy of information yourself and bear the risks of using this product.",
        ],
      },
      {
        title: "8. Changes and Termination",
        paras: [
          "[Pending] We may revise these Terms from time to time; the revised Terms will be published on this page and take effect upon publication.",
          "[Pending] If you breach these Terms, we may suspend or terminate your access to the service.",
        ],
      },
      {
        title: "9. Governing Law and Disputes",
        paras: [
          "[Pending] The formation, validity, interpretation and dispute resolution of these Terms are governed by the laws of the People's Republic of China.",
          "[Pending] Disputes arising from these Terms shall first be resolved through friendly negotiation; if negotiation fails, they shall be submitted to the competent people's court at the operator's location.",
        ],
      },
      {
        title: "10. Contact Us",
        paras: [
          "[Pending] If you have any questions about these Terms, please contact us via the in-app About page or official channels.",
        ],
      },
    ],
  },
};
