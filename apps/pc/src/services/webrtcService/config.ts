/**
 * WebRTC 默认配置 - NAT穿透优化版
 *
 * 【NAT穿透原理】
 * NAT（网络地址转换）特点：
 * - 内部IP:Port映射到外部IP:Port，但可能限制外部来源
 * - 不同的NAT类型穿透难度不同
 * - 对称型NAT（Symmetric NAT）最难穿透，双方都是对称NAT时需要TURN中继
 *
 * 【现代WebRTC如何支持NAT穿透】
 * 1. STUN服务器发现公网映射地址（srflx候选）
 * 2. 同时发送host候选和srflx候选给对方
 * 3. 双方尝试所有候选对（candidate pairs）
 * 4. 利用NAT的"打孔"特性：一旦建立映射，双向通信都可进行
 * 5. 某些路由器支持hairpinning（环回），host候选也能工作
 *
 * 【关键配置】
 * - iceTransportPolicy: 'all' - 使用所有候选类型（host、srflx）
 * - bundlePolicy: 'max-bundle' - 复用传输通道
 * - iceCandidatePoolSize: 10 - 预收集10个候选
 *
 * 【STUN服务器选择原则】
 * - 只保留2-3个高可用STUN服务器，过多会导致ICE收集延迟
 * - 浏览器会并行连接所有STUN服务器，不可用的服务器会阻塞收集
 * - Google STUN服务器最稳定，优先使用
 * - 国内STUN服务器作为备选，解决国内访问Google慢的问题
 *
 * 【重要说明】
 * - 不使用TURN/relay服务器（纯P2P），但预留了配置入口
 * - 只过滤relay候选，保留host和srflx候选
 * - WebRTC会自动按优先级尝试所有候选对
 * - 不要人为过滤候选类型，让浏览器自动决策
 *
 * 【对称NAT问题】
 * - 如果双方都在对称NAT后面，仅靠STUN无法穿透
 * - 此时需要TURN中继服务器作为fallback
 * - 检测方法：不同STUN服务器返回不同的映射端口 = 对称NAT
 */
export const DEFAULT_WEBRTC_CONFIG: RTCConfiguration = {
  iceServers: [
    // ========== Google STUN 服务器 (最稳定) ==========
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },

    // ========== 国内STUN服务器（国内用户优先使用） ==========
    { urls: 'stun:stun.miwifi.com:3478' },
    { urls: 'stun:stun.chat.bilibili.com:3478' },

    // ========== 其他公共STUN服务器 ==========
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:stun.skype.com:3478' },

    // ========== TURN服务器（对称NAT穿透必需） ==========
    // 如果双方都在对称NAT后面，必须使用TURN中继
    // 取消下面的注释并填入你的TURN服务器信息即可启用
    // {
    //   urls: 'turn:your-turn-server.com:3478',
    //   username: 'your-username',
    //   credential: 'your-credential',
    // },
    // {
    //   urls: 'turns:your-turn-server.com:5349',  // TURN over TLS
    //   username: 'your-username',
    //   credential: 'your-credential',
    // },
  ],
  iceTransportPolicy: 'all', // 使用所有候选类型
  bundlePolicy: 'max-bundle', // 最大复用
  rtcpMuxPolicy: 'require', // 要求 RTCP 复用
  iceCandidatePoolSize: 10, // 预收集候选池大小
};

/**
 * 创建WebRTC连接的配置对象
 * 返回一个新的RTCConfiguration实例，包含优化的ICE和媒体束策略
 */
export const createWebRTCConfig = (): RTCConfiguration => {
  return {
    ...DEFAULT_WEBRTC_CONFIG,
    iceTransportPolicy: 'all',
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
    iceCandidatePoolSize: 10,
  };
};

/**
 * 判断当前配置是否启用了 TURN/relay 服务器
 * 用于决定是否过滤 relay 候选（无 TURN 时应跳过，防止空转）
 */
export const hasTurnServer = (
  config: RTCConfiguration = DEFAULT_WEBRTC_CONFIG,
): boolean => {
  return (
    config.iceServers?.some((server) =>
      typeof server.urls === 'string'
        ? server.urls.startsWith('turn:') || server.urls.startsWith('turns:')
        : Array.isArray(server.urls) &&
          server.urls.some(
            (u) => u.startsWith('turn:') || u.startsWith('turns:'),
          ),
    ) ?? false
  );
};
