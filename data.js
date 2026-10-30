// 文言・日英・データ。処理は game.js
'use strict'
window.MP_DATA = {
  // 家族（寝ている人）。r=聞こえる距離、k=気づきやすさ
  FAMILY: [
    { id: 'sister', ja: '姉', en: 'Sis', r: 3.7, k: 1.0, loud: [1.3, 2.2], quiet: [1.0, 1.9], snoreJa: 'スピー', snoreEn: 'zzz', col: '#c9a4ff' },
    { id: 'dad', ja: '父', en: 'Dad', r: 5.0, k: 0.9, loud: [1.5, 2.4], quiet: [1.0, 1.9], snoreJa: 'グォォ', snoreEn: 'SNORK', col: '#7fd0ff' },
    { id: 'dog', ja: '犬', en: 'Pup', r: 4.6, k: 1.25, loud: [1.2, 2.0], quiet: [0.9, 1.7], snoreJa: 'プスー', snoreEn: 'pfff', col: '#ffc46b' },
    { id: 'mom', ja: '母', en: 'Mom', r: 4.4, k: 1.0, loud: [1.4, 2.2], quiet: [1.0, 1.8], snoreJa: 'ゴゴゴ', snoreEn: 'GRRR', col: '#ff9ec4' },
  ],
  // 冷蔵庫から取れるもの（取る順）
  ITEMS: [
    { id: 'pudding', ja: 'プリン', en: 'Pudding' },
    { id: 'karaage', ja: '唐揚げ', en: 'Fried chicken' },
    { id: 'cheesecake', ja: 'チーズケーキ', en: 'Cheesecake' },
    { id: 'yogurt', ja: '姉のヨーグルト', en: "Sis's yogurt" },
    { id: 'beer', ja: '父の缶ビール', en: "Dad's beer" },
    { id: 'cake', ja: 'ホールケーキ', en: 'A whole cake' },
  ],
  DAWN: 70, // 秒。3:00 から 1秒=1分で 4:10 に朝
  NUM_JA: ['初', '二', '三', '四', '五', '六', '七', '八', '九', '十'],
  // 成功時の副題（取れた数）
  SUB_OK: {
    ja: ['プリン1個で我慢できた、えらい人', 'ちょっとだけ欲張った人', 'ダイエットは明日から', '冷蔵庫の半分を持ち出した人', '家族の朝ごはんを消した人', '冷蔵庫を空にした伝説'],
    en: ['Stopped at one pudding. Respect.', 'Got a little greedy', 'Diet starts tomorrow', 'Took half the fridge', "Ate the family's breakfast", 'Emptied the entire fridge'],
  },
  // 見つかった時の副題（見つけた人）
  SUB_NG: {
    sister: { ja: '姉に見つかった夜食犯', en: 'Busted by Sis' },
    dad: { ja: '父と目が合った夜食犯', en: 'Locked eyes with Dad' },
    dog: { ja: '犬に通報された人', en: 'Reported by the dog' },
    mom: { ja: '母に捕まった現行犯', en: 'Caught red-handed by Mom' },
    dawn: { ja: '朝日を浴びた夜食犯', en: 'Caught by the sunrise' },
  },
  // 家族の寝言（成功）とひとこと（発覚）
  TALK: {
    ok: {
      sister: { ja: ['それ…わたしの…ヨーグルト…', 'むにゃ…推しが…尊い…', '…名前…書いといたのに…'], en: ['that... my... yogurt...', 'mmh... my idol... so precious...', '...I wrote my name on it...'] },
      dad: { ja: ['むにゃ…プリンは…一日一個まで…', 'ぐぉぉ…冷蔵庫…閉めたか…', '…それ…パパのビール…'], en: ['mmh... one pudding... a day...', 'snrk... did someone close the fridge...', '...that is... daddy\'s beer...'] },
      dog: { ja: ['…ワフ…（ぜんぶ見てたよ）', '…クゥーン…（ぼくにも…）', '…ムニャ…ワン…（共犯）'], en: ['...wuf... (I saw everything)', '...whine... (share with me...)', '...mrf... woof... (accomplice)'] },
      mom: { ja: ['家計簿…プリン代が…あわない…', 'だれ…夜中に…ガサガサ…', 'ダイエット…明日から…でしょ…'], en: ['the budget... pudding money... missing...', 'who is... rustling... at night...', 'diet... starts tomorrow... right...'] },
    },
    ng: {
      sister: { ja: ['写真撮った。家族LINEに送るね', 'それ私のだよね？', 'ダイエット中じゃなかったっけ'], en: ['Took a pic. Sending it to the family chat', 'That is mine, right?', 'Weren\'t you on a diet?'] },
      dad: { ja: ['…パパのビールだけは返して', 'パパは何も見てない。寝る', '一口ちょうだい'], en: ['...just give back my beer', 'Daddy saw nothing. Good night', 'Give me one bite'] },
      dog: { ja: ['ワン！（通報しました）', 'ワンワン！（分けて）', 'クゥーン（ぼくのぶんは？）'], en: ['WOOF! (reported you)', 'WOOF WOOF! (share!)', 'whine (where is mine?)'] },
      mom: { ja: ['何時だと思ってるの', 'ダイエット中じゃなかった？', 'それ明日のお弁当用なんだけど'], en: ['Do you know what time it is?', 'Weren\'t you on a diet?', 'That was for tomorrow\'s lunch'] },
    },
  },
  STR: {
    ja: {
      full: '深夜のプリン作戦',
      title1: '深夜の', title2: 'プリン作戦', tag: '家族が起きる前に、冷蔵庫のプリンを取ってこい。',
      start: 'はじめる', how: 'あそびかた', back: 'もどる', go: 'やってみる',
      howTitle: 'あそびかた',
      how1pc: 'スペースキーかマウスを<b>押している間だけ</b>進む。離すと止まる。', how1sp: '画面を<b>押している間だけ</b>進む。指を離すと止まる。',
      how2: '家族の<b>いびきが大きい間</b>だけ動け。静かな時に動くと「ん…？」とゲージがたまる。いびきは<b>急にピタッと止まる</b>ことがある。',
      how3: '<b>きしむ板</b>と<b>おもちゃ</b>は音が出る。いびきにまぎれて踏め。<b>寝ぼけた父</b>が歩き回っている。ぶつかると抱きつかれる。',
      how4: '冷蔵庫は押して開ける。押し続けると<b>どんどん取る</b>。離すと閉めて帰る。<b>明かりで母と犬が起きやすい</b>。',
      how5: '家族が<b>起き上がったら即固まれ</b>。見られている間に動くと発覚。朝4:10までに自分の部屋へ。',
      tutPc: 'スペースキーか<br>マウスを<b>押している間</b>進む', tutSp: '画面を<b>押している間</b>進む',
      tut2: 'いびきが<b>大きい間</b>だけ動け', tutGo: 'タップで開始', tutGoPc: 'クリックで開始',
      holdPc: '押しっぱなしで進む', holdSp: '押しっぱなしで進む',
      sigGo: 'いまだ！', sigStop: 'しずかに…', sigFreeze: '固まれ！', sigFridge: '押して開けろ', sigGrab: '押して取る／離して帰る', sigFull: 'もう持てない！離せ！',
      toDawn: '朝まで', creak: 'ギィッ', toy: 'ピコッ', hmm: 'ん…？', apnea: 'ピタッ…', wake: '…だれ？', door: 'ギーーッ', close: 'パタン',
      hug: 'むにゃ…まくら…', hugMe: 'はなして〜！', got: 'ゲット！',
      caughtMom: '何してるの', caughtDad: '…プリン？', caughtSis: 'それ私のやつ！', caughtDog: 'ワン！', caughtMe: 'ひぃぃ〜！',
      dawnMsg: 'ジリリリリ！朝だ！', yum: 'しあわせ〜', mogu: 'もぐもぐ',
      resOk: '成功', resNg: '発覚', ninja: '夜食の忍者', minarai: '夜食の見習い', kyu: '級', dan: '段', kaiden: '免許皆伝',
      rItems: '取れたもの', rWakes: '起こした回数', rTime: 'タイム', rTurns: '寝返り', sec: '秒', ko: '個', kai: '回',
      talkOk: '家族の寝言', talkNg: '家族のひとこと',
      again: 'もう一回', save: '画像を保存', toTitle: 'タイトル', saved: '画像を保存しました', skip: 'タップで飛ばす',
      lang: 'EN', none: 'なし', rest: 'ほか',
    },
    en: {
      full: 'MIDNIGHT PUDDING',
      title1: 'MIDNIGHT', title2: 'PUDDING', tag: 'Grab the pudding from the fridge before the family wakes up.',
      start: 'START', how: 'HOW TO PLAY', back: 'BACK', go: 'PLAY',
      howTitle: 'How to play',
      how1pc: 'Hold Space or the mouse to walk. <b>Let go to stop.</b>', how1sp: 'Hold the screen to walk. <b>Let go to stop.</b>',
      how2: 'Only move while the family is <b>snoring loud</b>. Moving in the quiet fills their "huh?" meter. Snores can <b>stop suddenly</b>.',
      how3: '<b>Creaky boards</b> and <b>toys</b> make noise. Step on them during a snore. <b>Sleepwalking Dad</b> roams around and hugs you if you bump into him.',
      how4: 'Hold to open the fridge. Keep holding to <b>grab more</b>. Let go to close it and head back. <b>The light wakes Mom and the dog</b>.',
      how5: 'If someone <b>sits up, freeze at once</b>. Move while they look and you are busted. Get back to bed by 4:10 AM.',
      tutPc: 'Hold <b>Space or the mouse</b><br>to walk', tutSp: '<b>Hold the screen</b> to walk',
      tut2: 'Move only while they <b>snore loud</b>', tutGo: 'Tap to start', tutGoPc: 'Click to start',
      holdPc: 'Hold to sneak', holdSp: 'Hold to sneak',
      sigGo: 'GO!', sigStop: 'shhh...', sigFreeze: 'FREEZE!', sigFridge: 'Hold to open', sigGrab: 'Hold: grab / Let go: leave', sigFull: 'Hands full! Let go!',
      toDawn: 'to dawn', creak: 'CREAK', toy: 'SQUEAK', hmm: 'hm...?', apnea: '...stopped?', wake: '...who?', door: 'CREEEAK', close: 'click',
      hug: 'mmh... my pillow...', hugMe: 'let me go~!', got: 'GOT IT!',
      caughtMom: 'What are you doing?', caughtDad: '...pudding?', caughtSis: 'That is MINE!', caughtDog: 'WOOF!', caughtMe: 'EEEEK!',
      dawnMsg: 'RIIING! It is morning!', yum: 'pure bliss~', mogu: 'nom nom',
      resOk: 'SUCCESS', resNg: 'BUSTED', ninja: 'Midnight Snack Ninja', minarai: 'Snack Trainee', kyu: 'Kyu', dan: 'Dan', kaiden: 'Grandmaster',
      rItems: 'Snacks', rWakes: 'Woke family', rTime: 'Time', rTurns: 'Rollovers', sec: 's', ko: '', kai: '',
      talkOk: 'Family sleep-talk', talkNg: 'Family says',
      again: 'AGAIN', save: 'SAVE IMAGE', toTitle: 'TITLE', saved: 'Image saved', skip: 'Tap to skip',
      lang: 'JA', none: 'none', rest: 'more',
    },
  },
}
