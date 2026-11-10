export type OutfitSlot = 'head' | 'face' | 'neck' | 'body' | 'hand';
export interface OutfitItem { id: string; name: string; art: string; thumb: string }
export interface Outfit { head: string | null; face: string | null; neck: string | null; body: string | null; hand: string | null }
export interface Outfits { yier: Outfit; bubu: Outfit }

export const OUTFIT_SLOTS: ReadonlyArray<{ id: OutfitSlot; name: string }> = [
  { id: 'head', name: '头部' },
  { id: 'face', name: '面部' },
  { id: 'neck', name: '脖子' },
  { id: 'body', name: '身体' },
  { id: 'hand', name: '手中' },
];

const CROPS: Record<OutfitSlot, string> = {
  head: '40 -26 100 82',
  face: '34 44 112 50',
  neck: '36 84 108 56',
  body: '38 80 104 66',
  hand: '22 18 138 124',
};
const thumb = (slot: OutfitSlot, art: string) => `<svg viewBox="${CROPS[slot]}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><g stroke="#50312d" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${art}</g></svg>`;

const ART: Record<OutfitSlot, Array<{ id: string; name: string; art: string }>> = {
  head: [
    { id: 'beanie', name: '针织帽', art: '<path d="M60 31 Q60 12 90 12 Q120 12 120 31 L120 34 L60 34 Z" fill="#cfe0c3"/><rect x="56" y="30" width="68" height="7" rx="3.5" fill="#b9d0a8"/><circle cx="90" cy="10" r="5" fill="#f2f6e9"/>' },
    { id: 'cap', name: '鸭舌帽', art: '<path d="M60 30 Q62 15 90 15 Q118 15 122 30 L122 34 L60 34 Z" fill="#e7b0a8"/><ellipse cx="90" cy="35" rx="35" ry="6" fill="#d99a92"/><circle cx="90" cy="16" r="2.6" fill="#f2d3ce" stroke="none"/>' },
    { id: 'beret', name: '贝雷帽', art: '<ellipse cx="90" cy="26" rx="34" ry="10" fill="#cfd9e8"/><path class="thin" d="M60 28 Q70 36 90 36 Q110 36 120 28" fill="none"/><circle cx="90" cy="15" r="4" fill="#b9c6dd"/>' },
    { id: 'crown', name: '小皇冠', art: '<path d="M66 28 L70 12 L79 20 L86 8 L94 20 L101 12 L106 28 Z" fill="#f0c27f"/><circle cx="86" cy="18" r="1.6" fill="#e7999a" stroke="none"/><circle cx="94" cy="18" r="1.6" fill="#8fd3d3" stroke="none"/><path class="thin" d="M64 30 H108" fill="none"/>' },
    { id: 'straw', name: '草帽', art: '<ellipse cx="90" cy="32" rx="44" ry="8" fill="#e9d3a8"/><path d="M62 30 Q64 15 90 15 Q116 15 118 30 Z" fill="#f2e2bf"/><path class="thin" d="M64 26 Q90 31 116 26" fill="none"/>' },
    { id: 'bunny', name: '兔耳发箍', art: '<path class="thin" d="M56 28 Q90 14 124 28" fill="none"/><path d="M64 24 Q56 0 66 -12 Q78 0 74 22 Z" fill="#fffefd"/><path d="M116 24 Q108 0 118 -12 Q130 0 126 22 Z" fill="#fffefd"/><ellipse cx="69" cy="-1" rx="2.6" ry="7" fill="#f5b4af" stroke="none"/><ellipse cx="121" cy="-1" rx="2.6" ry="7" fill="#f5b4af" stroke="none"/>' },
    { id: 'cat', name: '猫耳发箍', art: '<path class="thin" d="M58 26 Q90 14 122 26" fill="none"/><path d="M58 26 L52 4 L78 16 Z" fill="#e7b0a8"/><path d="M122 26 L128 4 L102 16 Z" fill="#e7b0a8"/><ellipse cx="62" cy="18" rx="1.6" ry="4" fill="#f5b4af" stroke="none"/><ellipse cx="118" cy="18" rx="1.6" ry="4" fill="#f5b4af" stroke="none"/>' },
    { id: 'horns', name: '恶魔角', art: '<path d="M60 24 Q52 10 60 2 Q70 10 66 26 Z" fill="#e08e86"/><path d="M120 24 Q128 10 120 2 Q110 10 114 26 Z" fill="#e08e86"/>' },
    { id: 'halo', name: '光环', art: '<ellipse cx="90" cy="4" rx="24" ry="5.5" fill="none" stroke="#e4b863" stroke-width="4"/><ellipse cx="90" cy="4" rx="24" ry="5.5" fill="none" stroke="#f3dca8" stroke-width="1.6" stroke-dasharray="3 6"/>' },
    { id: 'antenna', name: '弹簧天线', art: '<path class="thin" d="M70 20 Q60 6 70 0"/><circle cx="70" cy="-2" r="4.5" fill="#e7999a"/><path class="thin" d="M110 20 Q120 6 110 0"/><circle cx="110" cy="-2" r="4.5" fill="#8fd3d3"/>' },
    { id: 'nightcap', name: '睡帽', art: '<path d="M56 30 Q56 10 86 10 Q110 10 116 24 Q138 26 136 38 Q126 42 118 32 Q110 28 100 32 L56 36 Z" fill="#e08e86"/><path class="thin" d="M58 33 Q90 26 116 28" fill="none"/><circle cx="138" cy="39" r="4.5" fill="#f2e2bf"/>' },
    { id: 'hardhat', name: '安全帽', art: '<path d="M60 30 Q62 12 90 12 Q118 12 120 30 Z" fill="#f0c27f"/><path class="thin" d="M76 18 Q90 10 104 18" fill="none"/><ellipse cx="90" cy="32" rx="38" ry="5" fill="#e0a95f"/>' },
  ],
  face: [
    { id: 'glasses', name: '圆框眼镜', art: '<g fill="none"><circle cx="69" cy="70" r="12.5" fill="rgba(255,255,255,.18)" class="thin"/><circle cx="111" cy="70" r="12.5" fill="rgba(255,255,255,.18)" class="thin"/><path class="thin" d="M81.5 69 Q90 64 98.5 69"/><path class="thin" d="M56.5 67 L45 63"/><path class="thin" d="M123.5 67 L135 63"/></g>' },
    { id: 'shades', name: '墨镜', art: '<path d="M55.5 63.5 Q69 59.5 82.5 63.5 L81.5 75 Q69 80.5 57.5 75 Z" fill="#39423d"/><path d="M97.5 63.5 Q111 59.5 124.5 63.5 L122.5 75 Q111 80.5 98.5 75 Z" fill="#39423d"/><path class="thin" d="M82.5 67.5 Q90 64.5 97.5 67.5" fill="none"/><path class="thin" d="M60 65.5 L67 65" stroke="#9fb0a6" fill="none"/><path class="thin" d="M113 65.5 L120 65" stroke="#9fb0a6" fill="none"/>' },
    { id: 'monocle', name: '单片镜', art: '<circle cx="111" cy="70" r="13" fill="rgba(255,255,255,.2)" class="thin"/><path class="thin" d="M124 73 Q130 84 126 96" fill="none"/><path class="thin" d="M105 63 L108 66" stroke="#fffefd" fill="none"/>' },
    { id: 'mask', name: '小口罩', art: '<path d="M72 76 H108 Q113 92 106 101 Q90 107 74 101 Q67 92 72 76 Z" fill="#cfe0e8"/><path class="thin" d="M72 80 L56 74 M108 80 L124 74" fill="none"/><path class="thin" d="M78 88 H102 M80 94 H100" fill="none"/>' },
    { id: 'eyepatch', name: '眼罩', art: '<path d="M58 62 Q69 57 80 63 Q81 75 69 79 Q57 75 58 62 Z" fill="#39423d"/><path class="thin" d="M57 63 L43 59 M80 64 Q110 54 136 62" fill="none"/>' },
    { id: 'starmark', name: '星星贴纸', art: '<path d="M52 86 L54 82 L56 86 L60 87 L57 90 L58 94 L54 92 L50 94 L51 90 L48 87 Z" fill="#f0c27f"/><path d="M128 86 L130 82 L132 86 L136 87 L133 90 L134 94 L130 92 L126 94 L127 90 L124 87 Z" fill="#f0c27f"/>' },
    { id: 'mustache', name: '小胡子', art: '<path d="M78 84 Q84 75 90 82 Q96 75 102 84 Q96 80 90 87 Q84 80 78 84 Z" fill="#50312d" stroke="none"/>' },
    { id: 'bigblush', name: '夸张腮红', art: '<ellipse cx="53" cy="84" rx="13" ry="8" fill="#f5b4af" opacity=".65" stroke="none"/><ellipse cx="127" cy="84" rx="13" ry="8" fill="#f5b4af" opacity=".65" stroke="none"/>' },
    { id: 'freckles', name: '雀斑', art: '<g fill="#c98f6b" stroke="none"><circle cx="48" cy="86" r="1.2"/><circle cx="53" cy="89" r="1.1"/><circle cx="57" cy="85" r="1.1"/><circle cx="132" cy="86" r="1.2"/><circle cx="127" cy="89" r="1.1"/><circle cx="123" cy="85" r="1.1"/></g>' },
    { id: 'sweat', name: '汗珠', art: '<path d="M133 60 Q129 68 132 72 Q138 69 133 60 Z" fill="#8fd3d3"/><path class="thin" d="M133 64 Q133 67 132 69" fill="none" stroke="#fffefd"/>' },
    { id: 'bandaid', name: '创可贴', art: '<g transform="rotate(-18 120 84)"><rect x="111" y="80" width="18" height="8" rx="4" fill="#f2e2bf"/><circle cx="115" cy="84" r="1" fill="#d9c8a5" stroke="none"/><circle cx="120" cy="84" r="1" fill="#d9c8a5" stroke="none"/><circle cx="125" cy="84" r="1" fill="#d9c8a5" stroke="none"/></g>' },
    { id: 'vr', name: 'VR 眼镜', art: '<rect x="52" y="57" width="76" height="25" rx="11" fill="#39423d"/><path class="thin" d="M52 64 L44 62 M128 64 L136 62" fill="none"/><rect x="60" y="63" width="24" height="12" rx="5" fill="#8fd3d3" opacity=".5" stroke="none"/><rect x="96" y="63" width="24" height="12" rx="5" fill="#f5b4af" opacity=".5" stroke="none"/>' },
  ],
  neck: [
    { id: 'scarf', name: '围巾', art: '<path d="M52 97 Q70 108 90 108 Q110 108 128 97 L131 106 Q110 117 90 117 Q70 117 49 106 Z" fill="#e08e86"/><path d="M118 108 L128 132 L119 129 L113 110 Z" fill="#e08e86"/>' },
    { id: 'bow', name: '蝴蝶结', art: '<path d="M80 105 L68 99 L68 113 Z" fill="#f0c27f"/><path d="M100 105 L112 99 L112 113 Z" fill="#f0c27f"/><circle cx="90" cy="106" r="3.4" fill="#e0a95f"/>' },
    { id: 'bell', name: '铃铛项圈', art: '<path d="M62 103 Q90 112 118 103 L121 111 Q90 121 59 111 Z" fill="#f0c27f"/><circle cx="90" cy="121" r="5" fill="#e4b863"/><path class="thin" d="M87 124 L93 124" fill="none"/>' },
    { id: 'tie', name: '领带', art: '<path d="M86 104 H94 L96 110 L90 134 L84 110 Z" fill="#e08e86"/><path d="M84 102 H96 L94 107 L86 107 Z" fill="#d97e76"/>' },
    { id: 'pendant', name: '金币吊坠', art: '<path class="thin" d="M70 100 Q90 114 110 100" fill="none"/><circle cx="90" cy="116" r="6" fill="#f0c27f"/><path class="thin" d="M87 116 L93 116 M90 113 L90 119" stroke="#b08a5d"/>' },
    { id: 'bib', name: '口水巾', art: '<path d="M70 100 Q90 112 110 100 L112 118 Q90 130 68 118 Z" fill="#cfe0e8"/><path class="thin" d="M74 102 L72 96 M106 102 L108 96" fill="none"/><path class="thin" d="M82 112 Q90 116 98 112" fill="none"/>' },
    { id: 'headphones', name: '挂脖耳机', art: '<path d="M58 102 Q90 84 122 102 L122 108 Q90 92 58 108 Z" fill="#39423d"/><rect x="50" y="94" width="13" height="20" rx="6" fill="#39423d"/><rect x="117" y="94" width="13" height="20" rx="6" fill="#39423d"/>' },
    { id: 'towel', name: '运动毛巾', art: '<path d="M62 104 Q90 116 118 104 L120 111 Q90 123 60 111 Z" fill="#fffefd"/><path d="M104 112 L110 132 L99 129 Z" fill="#fffefd"/><path class="thin" d="M104 116 L108 128" fill="none" stroke="#cfe0e8"/>' },
    { id: 'lanyard', name: '工牌挂绳', art: '<path class="thin" d="M70 100 L90 116 L110 100" fill="none" stroke="#8fd3d3"/><rect x="83" y="114" width="14" height="17" rx="2" fill="#fffefd"/><circle cx="90" cy="120" r="3" fill="#cfd9e8" stroke="none"/><path class="thin" d="M86 126 H94" fill="none" stroke="#9fb0a6"/>' },
    { id: 'silk', name: '小丝巾', art: '<path d="M62 104 Q90 115 118 104 L120 110 Q90 121 60 110 Z" fill="#cfd9e8"/><circle cx="64" cy="109" r="3.5" fill="#b9c6dd"/><path class="thin" d="M64 111 L58 124" fill="none" stroke="#cfd9e8"/>' },
    { id: 'nametag', name: '名牌项圈', art: '<path d="M64 104 Q90 114 116 104 L118 110 Q90 120 62 110 Z" fill="#a7b8a0"/><rect x="80" y="112" width="20" height="9" rx="2" fill="#f2e2bf"/><path class="thin" d="M84 116 H96" fill="none" stroke="#b08a5d"/>' },
    { id: 'pearl', name: '珍珠项链', art: '<path class="thin" d="M68 101 Q90 113 112 101" fill="none" stroke="#d9c8a5"/><g fill="#f2f6e9"><circle cx="78" cy="106" r="2"/><circle cx="86" cy="109" r="2"/><circle cx="94" cy="109" r="2"/><circle cx="102" cy="106" r="2"/></g>' },
  ],
  body: [
    { id: 'tee', name: 'T恤', art: '<path d="M66 92 Q72 96 90 96 Q108 96 114 92 L122 104 Q118 108 114 106 L114 124 Q90 130 66 124 L66 106 Q62 108 58 104 Z" fill="#cfe0c3"/>' },
    { id: 'hoodie', name: '卫衣', art: '<path d="M64 92 Q72 98 90 98 Q108 98 116 92 L124 106 Q118 110 114 108 L114 126 Q90 132 66 126 L66 108 Q62 110 56 106 Z" fill="#e7b0a8"/><path class="thin" d="M76 94 Q90 104 104 94" fill="none"/><path class="thin" d="M78 116 Q90 122 102 116" fill="none"/><path class="thin" d="M80 100 L84 112 M100 100 L96 112" fill="none"/>' },
    { id: 'overalls', name: '背带裤', art: '<path d="M76 96 L104 96 L106 124 Q90 130 74 124 Z" fill="#a7b8a0"/><path class="thin" d="M76 96 L68 88 M104 96 L112 88" fill="none"/><circle cx="79" cy="101" r="2.2" fill="#e4b863" stroke="none"/><circle cx="101" cy="101" r="2.2" fill="#e4b863" stroke="none"/>' },
    { id: 'vest', name: '马甲', art: '<path d="M66 92 L78 96 L76 126 Q68 123 63 118 Z" fill="#a7b8a0"/><path d="M114 92 L102 96 L104 126 Q112 123 117 118 Z" fill="#a7b8a0"/><circle cx="90" cy="106" r="1.6" fill="#e4b863" stroke="none"/><circle cx="90" cy="114" r="1.6" fill="#e4b863" stroke="none"/>' },
    { id: 'raincoat', name: '小雨衣', art: '<path d="M62 90 Q70 98 90 98 Q110 98 118 90 L126 110 L120 128 Q90 136 60 128 L54 110 Z" fill="#f0c27f"/><path class="thin" d="M90 98 L90 132" fill="none"/><circle cx="96" cy="110" r="1.8" fill="#b08a5d" stroke="none"/><circle cx="96" cy="120" r="1.8" fill="#b08a5d" stroke="none"/>' },
    { id: 'suit', name: '小西装', art: '<path d="M62 92 Q70 98 90 98 Q110 98 118 92 L124 112 Q120 128 90 132 Q60 128 56 112 Z" fill="#39423d"/><path class="thin" d="M82 96 L90 118 L98 96" fill="none" stroke="#fffefd"/><circle cx="90" cy="106" r="1.6" fill="#e4b863" stroke="none"/>' },
    { id: 'jersey', name: '球衣', art: '<path d="M70 92 Q80 98 90 98 Q100 98 110 92 L112 124 Q90 130 68 124 Z" fill="#8fb3d9"/><text x="90" y="118" text-anchor="middle" font-size="14" font-weight="700" fill="#fffefd" stroke="none" font-family="Segoe UI,sans-serif">7</text>' },
    { id: 'apron', name: '小围裙', art: '<path d="M72 94 L74 126 Q90 132 106 126 L108 94" fill="#cfe0c8"/><path class="thin" d="M76 96 L72 88 M104 96 L108 88" fill="none"/><path class="thin" d="M80 112 H100 V122 Q90 126 80 122 Z" fill="#b9d0a8"/>' },
    { id: 'cape', name: '小红披风', art: '<path d="M58 92 Q90 104 122 92 L134 128 Q90 140 46 128 Z" fill="#e08e86"/><circle cx="84" cy="100" r="2.2" fill="#e4b863" stroke="none"/><circle cx="96" cy="100" r="2.2" fill="#e4b863" stroke="none"/>' },
    { id: 'pajamas', name: '星星睡衣', art: '<path d="M64 92 Q72 98 90 98 Q108 98 116 92 L122 110 Q120 128 90 132 Q60 128 58 110 Z" fill="#cfd9e8"/><g fill="#f2e2bf" stroke="none"><circle cx="74" cy="106" r="1.6"/><circle cx="86" cy="118" r="1.6"/><circle cx="104" cy="108" r="1.6"/><circle cx="96" cy="96" r="1.4"/><circle cx="66" cy="120" r="1.4"/></g><path class="thin" d="M90 98 L90 128" fill="none"/>' },
    { id: 'kigurumi', name: '毛绒连体衣', art: '<path d="M64 90 Q72 98 90 98 Q108 98 116 90 L124 112 Q120 132 90 136 Q60 132 56 112 Z" fill="#f2ddc2"/><ellipse cx="90" cy="116" rx="16" ry="12" fill="#f7ecd9" stroke="none"/><circle cx="76" cy="102" r="2" fill="#e0a95f" stroke="none"/><circle cx="104" cy="102" r="2" fill="#e0a95f" stroke="none"/>' },
    { id: 'spacesuit', name: '宇航服', art: '<path d="M62 92 Q70 98 90 98 Q110 98 118 92 L124 112 Q120 130 90 134 Q60 130 56 112 Z" fill="#fffefd"/><rect x="78" y="104" width="24" height="14" rx="3" fill="#cfd9e8"/><circle cx="84" cy="111" r="2" fill="#e08e86" stroke="none"/><circle cx="96" cy="111" r="2" fill="#8fd3d3" stroke="none"/><path class="thin" d="M64 100 L62 96 M116 100 L118 96" fill="none"/>' },
    { id: 'swimring', name: '泳圈', art: '<path fill-rule="evenodd" d="M56 112 Q56 96 90 96 Q124 96 124 112 Q124 128 90 128 Q56 128 56 112 Z M72 112 Q72 104 90 104 Q108 104 108 112 Q108 120 90 120 Q72 120 72 112 Z" fill="#f2b8b0"/><path class="thin" d="M60 104 Q66 98 76 98" fill="none" stroke="#fffefd"/>' },
    { id: 'romper', name: '背带短裤', art: '<path d="M74 96 L106 96 L108 116 L100 118 L98 132 L94 118 L86 118 L82 132 L80 118 L72 116 Z" fill="#a7c4b5"/><path class="thin" d="M74 96 L70 88 M106 96 L110 88" fill="none"/><circle cx="78" cy="100" r="1.8" fill="#e4b863" stroke="none"/><circle cx="102" cy="100" r="1.8" fill="#e4b863" stroke="none"/>' },
  ],
  hand: [
    { id: 'coffee', name: '咖啡杯', art: '<g transform="translate(110 90)"><path d="M0 8 H20 L18 26 Q9 30 2 26 Z" fill="#f2ddc2"/><rect x="-1" y="4" width="22" height="6" rx="2.5" fill="#cfe0c3"/><path class="thin" d="M11 4 L14 -6" fill="none"/></g>' },
    { id: 'fish', name: '小鱼干', art: '<g transform="translate(46 96)"><path d="M0 10 Q7 2 15 6 Q21 2 24 10 Q21 18 15 14 Q7 18 0 10Z" fill="#cfe0e8"/><circle cx="19" cy="8" r="1.4" fill="#50312d" stroke="none"/></g>' },
    { id: 'balloon', name: '气球', art: '<path class="thin" d="M124 100 Q138 80 147 56" fill="none"/><ellipse cx="148" cy="42" rx="10" ry="12" fill="#e7999a"/><path class="thin" d="M145 54 L151 54" fill="none"/>' },
    { id: 'phone', name: '手机', art: '<g transform="translate(108 82)"><rect x="0" y="0" width="17" height="27" rx="3.5" fill="#39423d"/><rect x="2.5" y="3" width="12" height="18" rx="1.5" fill="#8fd3d3" stroke="none"/><circle cx="8.5" cy="24" r="1.2" fill="#fffefd" stroke="none"/></g>' },
    { id: 'boba', name: '珍珠奶茶', art: '<g transform="translate(106 88)"><path d="M2 8 H22 L19 30 Q12 33 5 30 Z" fill="#f2ddc2"/><path d="M1 4 Q12 0 23 4 L23 8 H1 Z" fill="#cfd9e8"/><path class="thin" d="M13 2 L16 -8" fill="none"/><g fill="#50312d" stroke="none"><circle cx="8" cy="26" r="1.2"/><circle cx="12" cy="28" r="1.2"/><circle cx="16" cy="26" r="1.2"/></g></g>' },
    { id: 'icecream', name: '冰淇淋', art: '<g transform="translate(48 84)"><path d="M2 10 L8 30 L16 10 Z" fill="#e9c38c"/><circle cx="9" cy="6" r="8" fill="#f5b4af"/><path class="thin" d="M5 8 Q9 4 13 8" fill="none" stroke="#fffefd"/></g>' },
    { id: 'broom', name: '小扫把', art: '<g transform="rotate(12 48 100)"><path class="thin" d="M48 62 L42 116" fill="none"/><path d="M36 112 L48 112 L44 134 L28 130 Z" fill="#f0c27f"/><path class="thin" d="M33 118 L43 118 M31 124 L41 124" fill="none" stroke="#b08a5d"/></g>' },
    { id: 'flag', name: '小旗子', art: '<path class="thin" d="M46 70 L46 128" fill="none"/><path d="M46 72 L86 70 L82 82 L86 94 L46 92 Z" fill="#e08e86"/><path class="thin" d="M54 78 H78 M54 86 H72" fill="none" stroke="#fffefd"/>' },
    { id: 'fan', name: '小风扇', art: '<g transform="translate(118 84)"><circle cx="0" cy="0" r="10" fill="#cfe0e8"/><path class="thin" d="M-6 -6 Q0 0 6 -6 M-7 2 Q0 0 7 2" fill="none"/><path class="thin" d="M0 10 L-3 22" fill="none"/></g>' },
    { id: 'glowstick', name: '荧光棒', art: '<rect x="44" y="78" width="7" height="30" rx="3.5" fill="#8fd3d3"/><ellipse cx="47.5" cy="76" rx="5" ry="3" fill="#c8ecec"/><path class="thin" d="M58 74 L60 68 M62 80 L68 78" fill="none" stroke="#8fd3d3"/>' },
    { id: 'rose', name: '小玫瑰', art: '<g transform="translate(120 86)"><path class="thin" d="M0 10 L-2 30" fill="none" stroke="#87a06f"/><circle cx="0" cy="4" r="7" fill="#e7999a"/><path class="thin" d="M-3 2 Q0 -2 3 2 Q0 6 -3 2" fill="none" stroke="#c97f7f"/><path d="M-2 16 Q-8 12 -10 18 Q-4 22 -2 16 Z" fill="#a7b8a0"/></g>' },
    { id: 'controller', name: '游戏手柄', art: '<g transform="translate(100 96)"><rect x="0" y="4" width="34" height="16" rx="8" fill="#39423d"/><circle cx="9" cy="12" r="2.4" fill="#e7999a" stroke="none"/><circle cx="25" cy="12" r="2.4" fill="#8fd3d3" stroke="none"/><path class="thin" d="M14 10 H20 M17 7 V13" stroke="#fffefd" fill="none"/></g>' },
    { id: 'paycheck', name: '工资条', art: '<g transform="translate(46 92)"><rect x="0" y="0" width="18" height="24" rx="2" fill="#fffefd"/><path class="thin" d="M3 5 H15 M3 9 H15 M3 13 H11" fill="none" stroke="#9fb0a6"/><circle cx="12" cy="19" r="2.4" fill="#e08e86" stroke="none"/></g>' },
    { id: 'book', name: '小书', art: '<g transform="translate(112 94) rotate(8)"><rect x="0" y="0" width="20" height="26" rx="2" fill="#a7b8a0"/><rect x="0" y="0" width="6" height="26" rx="2" fill="#8fa37f" stroke="none"/><path class="thin" d="M9 8 H16 M9 13 H16" fill="none" stroke="#fffefd"/></g>' },
  ],
};

export const OUTFIT_CATALOG: Record<OutfitSlot, OutfitItem[]> = {
  head: ART.head.map(item => ({ ...item, thumb: thumb('head', item.art) })),
  face: ART.face.map(item => ({ ...item, thumb: thumb('face', item.art) })),
  neck: ART.neck.map(item => ({ ...item, thumb: thumb('neck', item.art) })),
  body: ART.body.map(item => ({ ...item, thumb: thumb('body', item.art) })),
  hand: ART.hand.map(item => ({ ...item, thumb: thumb('hand', item.art) })),
};

export const EMPTY_OUTFITS = (): Outfits => ({ yier: { head: null, face: null, neck: null, body: null, hand: null }, bubu: { head: null, face: null, neck: null, body: null, hand: null } });

function normalizeOutfit(input: unknown): Outfit {
  const value = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
  const outfit: Outfit = { head: null, face: null, neck: null, body: null, hand: null };
  for (const slot of OUTFIT_SLOTS) {
    const id = value[slot.id];
    if (typeof id === 'string' && OUTFIT_CATALOG[slot.id].some(item => item.id === id)) outfit[slot.id] = id;
  }
  return outfit;
}

export function normalizeOutfits(input: unknown): Outfits {
  const value = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
  return { yier: normalizeOutfit(value.yier), bubu: normalizeOutfit(value.bubu) };
}
