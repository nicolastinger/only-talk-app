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
    githubClient: "Client repo (only-talk-app)",
    githubServer: "Server repo (only-talk-rs)",
    githubClientShort: "Client",
    githubServerShort: "Server",
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
        title: "Secure",
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
        desc: "Built-in WebRTC audio/video calls for one-on-one conversations, smooth and crystal clear.",
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
          "Peer-to-peer delivery that minimizes server relay",
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
      { name: "Security", tech: "TLS · SQLCipher · Local encryption" },
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
      "Installers are published via GitHub Releases; click a button below to download from the latest release.",
    clientTitle: "Client Installers",
    viaReleases: "Download from GitHub Releases",
    releasesText: "Visit GitHub Releases for older versions and changelogs",
  },
  legal: {
    notice:
      "This document is sample text for the open-source project Only Talk. The operator is the project itself with no registered address; please file an issue in the project repository for any questions.",
    updatedAt: "Last updated",
  },
  privacy: {
    title: "Privacy Policy",
    sections: [
      {
        title: "1. Introduction and Scope",
        paras: [
          'Only Talk (the "Product", "we", "us") is an open-source, cross-platform instant messaging app built on QUIC and P2P technology. The Product is an open-source project operated by its maintainers, with no commercial operating entity or registered address. We understand how important your personal information is to you and will do our best to keep it secure and reliable. We are committed to earning and maintaining your trust, and process your personal information under the principles of accountability, purpose limitation, consent, data minimization, security, user participation and transparency.',
          "This Privacy Policy applies to the Only Talk client (desktop and mobile), the official website and the related services. Please read this policy carefully and fully understand it before using the Product. Terms that have a material impact on your personal information rights are highlighted for your attention.",
          "By starting to use the Product, you confirm that you have fully understood and agreed to this policy. If you do not agree, please stop using the Product immediately.",
        ],
      },
      {
        title: "2. Definitions",
        paras: [
          "Personal information: information relating to an identified or identifiable natural person that is recorded electronically or otherwise, excluding anonymized information.",
          "Sensitive personal information: personal information that, once leaked or illegally used, may harm a natural person's dignity or the safety of their person or property, as well as the personal information of children under 14 years of age.",
          "Device information: information about the device you use with the Product, such as device model, OS version, device identifiers and network status.",
          "De-identification: technical processing of personal information so that a specific natural person cannot be identified without additional information.",
        ],
      },
      {
        title: "3. How We Collect and Use Your Personal Information",
        paras: [
          "Registration and sign-in: you may register and sign in with an email verification code. To complete registration, we collect your email address, verification code, username (account) and password (if any). You may optionally complete your avatar, nickname and signature.",
          "Instant messaging: to send, receive and sync text, image and file messages, we process the message content and related files you send. Text messages are relayed through our servers for delivery and history sync; images and files are uploaded to our file storage service so the other party can download them. Chat records are stored locally in encrypted form (SQLCipher). In private mode you may use peer-to-peer delivery, and messages are not stored on the server.",
          "Audio/video calls: when you use voice or video calls, we access the camera and microphone with your authorization and process audio/video data during the call; call media is preferentially transmitted peer-to-peer over a direct P2P connection.",
          "Moments plaza: when you post content, like or comment, we collect the content you post and your interaction records to display them to you and your friends.",
          "Friends and groups: to establish friend relationships and group chats, we process your friend connections, group membership and related operation records.",
          "Security and operations: to prevent, detect and handle security risks (such as abnormal sign-ins, malicious registration and system faults), we collect device information, log information (operation logs, crash logs) and network status.",
          "Customer support and feedback: when you contact us or submit feedback, we collect the contact details and problem descriptions you provide in order to handle your request.",
          "Please note that some of the above features require you to grant the corresponding system permissions. If you refuse, you will not be able to use those features, but this will not affect your use of other features.",
        ],
      },
      {
        title: "4. Cookies and Similar Technologies",
        paras: [
          "The official website uses local storage (localStorage) to remember your language, theme and other preferences in order to improve your experience. You can clear this data through your browser settings.",
          "The Product client does not use cookies or similar technologies for advertising tracking. If such capabilities are introduced in the future, we will obtain your separate consent.",
        ],
      },
      {
        title: "5. Device Permissions",
        paras: [
          "To provide the corresponding features, the Product may request the following system permissions: camera (taking photos, scanning codes), photos/storage (sending images and files), microphone (voice and video calls) and notifications (message alerts).",
          "You can enable or disable these authorizations at any time in your system settings; once disabled, the related features may not work properly.",
        ],
      },
      {
        title:
          "6. How We Share, Transfer and Publicly Disclose Your Personal Information",
        paras: [
          "Sharing: we do not sell your personal information to third parties. We share it only in the following cases: with your explicit consent; with entrusted third-party service providers for functions such as file storage and delivery or message push, sharing only the necessary information and requiring them to comply with confidentiality and security obligations; and as required by laws or competent authorities.",
          "Transfer: we do not transfer your personal information, except in the event of a merger, acquisition or reorganization, in which case we will require the successor to continue to be bound by this policy.",
          "Public disclosure: we will publicly disclose your personal information only with your explicit consent or where required by law.",
        ],
      },
      {
        title: "7. How We Store Your Personal Information",
        paras: [
          "Location: in principle, your personal information is stored within the People's Republic of China. If cross-border transfer is required, we will fulfill the corresponding legal obligations.",
          "Retention: we retain your personal information only for the shortest period necessary to fulfill the purposes described in this policy, unless otherwise required by law. After you close your account or actively delete chat records, they will be handled in accordance with the law and this policy.",
        ],
      },
      {
        title: "8. How We Protect Your Personal Information",
        paras: [
          "We use industry-standard security measures to protect your personal information, including but not limited to: TLS encryption for transmission, SQLCipher encryption for local chat records, access control and data de-identification.",
          "We strive to keep the information you send to us secure, but the internet is not an absolutely secure environment. Please keep your account and password safe and you are responsible for all activity under your account.",
        ],
      },
      {
        title: "9. Your Rights",
        paras: [
          "Access and correction: you can view and correct your account profile in the app at any time.",
          "Deletion: you can delete chat records, posts and other content, or request deletion of your personal information.",
          "Withdrawal of consent: you can withdraw your authorization by disabling the relevant system permissions or closing your account.",
          "Account closure: you may apply to close your account; after closure, we will handle your information in accordance with the law and this policy.",
          "Complaints and reports: you can make a complaint or report through the contact channels listed in this policy, and we will handle it as soon as possible.",
        ],
      },
      {
        title: "10. Third-Party Services",
        paras: [
          "To provide functions such as file storage and delivery and email verification codes, the Product may integrate third-party services. These third parties may process your information under their own privacy policies, which we recommend you review.",
          "We supervise the personal information processing activities of the third parties we integrate, and require them to process your personal information in accordance with this policy and applicable laws.",
        ],
      },
      {
        title: "11. How We Handle Minors' Personal Information",
        paras: [
          "The Product is primarily intended for adults. We do not actively collect the personal information of children under 14 years of age. If you are a minor, please use the Product under the guidance of your guardian and read this policy.",
          "If we discover that we have collected a minor's personal information without first obtaining verifiable guardian consent, we will endeavor to delete the relevant data as soon as possible.",
        ],
      },
      {
        title: "12. Changes to This Policy",
        paras: [
          "We may revise this policy from time to time. We will not reduce the rights you are entitled to under this policy without your explicit consent. For material changes, we will notify you prominently by push notification, announcement or similar means.",
          "You can review the latest version of this policy on this page at any time. If you continue to use the Product after an update, you agree to be bound by the updated policy.",
        ],
      },
      {
        title: "13. Contact Us",
        paras: [
          "The Product is an open-source project; the operator is the project itself and there is no commercial registered address. If you have any questions, comments or complaints about this policy or the protection of your personal information, please file an issue in the project repository https://github.com/nicolastinger/only-talk-app to contact us.",
          "We will reply as soon as possible after receiving your feedback.",
        ],
      },
      {
        title: "14. Miscellaneous",
        paras: [
          "The interpretation of this policy and the resolution of disputes shall be governed by the laws of the People's Republic of China. Disputes arising from this policy shall be resolved through friendly negotiation; if negotiation fails, either party may bring a lawsuit before a competent people's court in accordance with the law.",
          "Only Talk is an open-source project; the operator is the project itself and there is no commercial registered address. Communications regarding this policy should be made by filing an issue in the project repository.",
        ],
      },
    ],
  },
  agreement: {
    title: "Terms of Use",
    sections: [
      {
        title: "1. Acceptance and Scope",
        paras: [
          'These Terms constitute an agreement between you and the Only Talk open-source project (the "Product", "we", "us") regarding your download, installation and use of the Product and related services. The Product is an open-source project operated by its maintainers, with no commercial operating entity or registered address.',
          "Please read and fully understand these Terms before using the Product, especially the clauses on exemption or limitation of liability, governing law and dispute resolution. If you do not agree, please stop using the Product immediately.",
          "By downloading, installing, launching or using the Product in any way, you are deemed to have read, understood and agreed to all of these Terms.",
        ],
      },
      {
        title: "2. Definitions",
        paras: [
          "Product: the Only Talk client (desktop and mobile), the official website and the accompanying services.",
          "User / you: a natural person who downloads, installs or uses the Product.",
          "Account: the identifier you register to use the Product.",
          "User Content: text, images, files, posts and other content that you publish or transmit through the Product.",
        ],
      },
      {
        title: "3. Account Registration and Use",
        paras: [
          "You may register an account with an email verification code. You should provide true, accurate and lawful registration information and keep it up to date.",
          "Accounts are for personal use only and may not be lent, rented, transferred or traded, nor used for any unlawful purpose.",
          "You should keep your account and password safe and are responsible for all activity under your account. If your account is compromised or at risk, please contact us promptly.",
          "If you breach these Terms, we may, as appropriate, issue a warning, restrict features, suspend or terminate the service.",
        ],
      },
      {
        title: "4. Acceptable Use",
        paras: [
          "You agree to comply with laws and public decency and not to use the Product to: publish or transmit illegal content; infringe the lawful rights of others (including but not limited to intellectual property, reputation and privacy); post harassing, abusive, intimidating, discriminatory or false information; distribute malware, viruses or other content harmful to cybersecurity; or interfere with or disrupt the normal operation of the Product and its services in any way.",
          "You may not use the Product for any unauthorized commercial activity, or for unauthorized scraping or bulk registration.",
          "If your conduct causes damage or legal liability to any third party, you shall bear it yourself.",
        ],
      },
      {
        title: "5. Software License and Use",
        paras: [
          "The Product is open-source software, and its source code is licensed to you under the LICENSE in the repositories. Subject to that license, you may view, use, modify and distribute the source code.",
          "Rights in the Product's name, logos, interface design and other non-source-code elements belong to the project and its contributors; they may not be used without permission.",
        ],
      },
      {
        title: "6. Content and Intellectual Property",
        paras: [
          "The intellectual property in the User Content you publish or transmit belongs to you or the respective rights holders. You should ensure you hold lawful rights to such content and that it does not infringe any third party's lawful rights.",
          "To provide, maintain and improve the service, you grant us a non-exclusive, royalty-free license to store, transmit and display your User Content within the Product.",
          "You should comply with content standards and not publish content that violates laws or these Terms; we have the right to handle violating content.",
        ],
      },
      {
        title:
          "7. Provision, Changes, Interruption and Termination of Services",
        paras: [
          'The Product is provided on an "as is" basis. We may change, interrupt or terminate part or all of the services due to version updates, maintenance, force majeure or other reasons, and will make reasonable efforts to notify you in advance.',
          "You understand and agree that, to the extent permitted by law, we are not liable for losses caused to you by such changes, interruptions or termination of the services.",
          "You may stop using the Product and close your account at any time.",
        ],
      },
      {
        title: "8. Privacy",
        paras: [
          "We take the protection of your personal information very seriously. For the specific data processing rules, please see the Privacy Policy. By using the Product, you agree that we may process your personal information in accordance with the Privacy Policy.",
        ],
      },
      {
        title: "9. Use by Minors",
        paras: [
          "The Product is primarily intended for adults. If you are a minor, you should use the Product under the guidance of your guardian and read these Terms together with your guardian.",
          "Guardians should supervise and guide a minor's use of the Product and bear the corresponding responsibility.",
        ],
      },
      {
        title: "10. Third-Party Services and Open-Source Components",
        paras: [
          "The Product may include third-party open-source components or integrate third-party services. Such components and services are provided by their respective rights holders and may be subject to their own licenses and terms.",
          "To the extent permitted by law, we are not liable for issues arising from third-party components or services.",
        ],
      },
      {
        title: "11. Disclaimer",
        paras: [
          'To the maximum extent permitted by law, the Product is provided on an "as is" and "as available" basis, and we make no warranty as to the timeliness, security, accuracy or stability of the service.',
          "You should judge the authenticity and lawfulness of User Content yourself and bear the risks of using the Product.",
          "To the extent permitted by law, we are not liable for service interruptions or data loss caused by force majeure, network failures or third-party causes.",
        ],
      },
      {
        title: "12. Changes to These Terms",
        paras: [
          "We may revise these Terms from time to time; the revised Terms will be published on this page and take effect upon publication.",
          "If you continue to use the Product after an update, you are deemed to agree to be bound by the updated Terms.",
        ],
      },
      {
        title: "13. Governing Law and Disputes",
        paras: [
          "The formation, validity, interpretation and dispute resolution of these Terms are governed by the laws of the People's Republic of China.",
          "Disputes arising from these Terms shall first be resolved through friendly negotiation; if negotiation fails, either party may bring a lawsuit before a competent people's court in accordance with the law.",
        ],
      },
      {
        title: "14. Contact Us",
        paras: [
          "The Product is an open-source project; the operator is the project itself and there is no commercial registered address. If you have any questions, comments or complaints about these Terms, please file an issue in the project repository https://github.com/nicolastinger/only-talk-app to contact us.",
        ],
      },
    ],
  },
};
