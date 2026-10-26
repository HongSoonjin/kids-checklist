import { useEffect, useState } from 'react'
import {
  onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, setPersistence, browserLocalPersistence, browserSessionPersistence
} from 'firebase/auth'
import {
  doc, setDoc, addDoc, updateDoc, deleteDoc, collection,
  onSnapshot, query, where, serverTimestamp
} from 'firebase/firestore'
import { auth, db } from './firebase'

const STATUS = {
  requested: { icon: '⏳', label: '기다리는 중', cls: 'wait' },
  seen: { icon: '👀', label: '확인했어요', cls: 'seen' },
  done: { icon: '✅', label: '챙겨줬어요', cls: 'done' },
  declined: { icon: '💬', label: '보류', cls: 'hold' }
}
const COLORS = ['#3451D1', '#E5484D', '#12A594', '#8E4EC6', '#E5930A']
const colorOf = (n = '') => COLORS[[...n].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length]
const today = () => new Date().toLocaleDateString('sv')
const daysLeft = (d) => Math.round((new Date(d) - new Date(today())) / 86400000)
const closed = (it) => it.status === 'done' && it.receivedByChild
const urgent = (it) => it.status !== 'done' && daysLeft(it.dueDate) <= 1
const cmp = (a, b) => (closed(a) - closed(b)) || a.dueDate.localeCompare(b.dueDate)

function dueLabel(d) {
  const n = daysLeft(d)
  if (n < 0) return `${-n}일 지났어요`
  if (n === 0) return '오늘까지'
  if (n === 1) return '내일까지'
  return `${d.slice(5).replace('-', '/')}까지`
}

const AUTH_MSG = {
  'auth/email-already-in-use': '이미 가입된 이메일이에요. "이미 계정이 있어요"를 눌러 로그인해 주세요.',
  'auth/invalid-credential': '이메일이나 비밀번호가 맞지 않아요.',
  'auth/wrong-password': '이메일이나 비밀번호가 맞지 않아요.',
  'auth/user-not-found': '가입되지 않은 이메일이에요. 먼저 가입해 주세요.',
  'auth/invalid-email': '이메일 형식이 올바르지 않아요. 예: name@family.app',
  'auth/weak-password': '비밀번호는 6자 이상이어야 해요.',
  'auth/operation-not-allowed': 'Firebase에서 이메일/비밀번호 로그인이 꺼져 있어요.',
  'auth/invalid-api-key': 'Firebase 설정값이 비어 있거나 잘못됐어요.',
  'auth/network-request-failed': '네트워크 연결을 확인해 주세요.',
  'auth/too-many-requests': '시도가 너무 많아요. 잠시 뒤에 다시 해보세요.'
}

// 가입 처리 중에는 로그인 상태 변화를 무시해서 화면이 바뀌지 않게 함
let signingUp = false

const store = {
  get: (k) => { try { return localStorage.getItem(k) } catch { return null } },
  set: (k, v) => { try { localStorage.setItem(k, v) } catch { /* 저장 불가 환경 */ } },
  del: (k) => { try { localStorage.removeItem(k) } catch { /* 저장 불가 환경 */ } }
}

function Login({ onDone }) {
  const [signup, setSignup] = useState(false)
  const [f, setF] = useState({
    email: store.get('saveEmail') === '1' ? store.get('savedEmail') || '' : '',
    password: '', name: '', role: 'child', code: ''
  })
  const [saveEmail, setSaveEmail] = useState(store.get('saveEmail') === '1')
  const [keep, setKeep] = useState(store.get('keepLogin') !== '0')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  function remember(email) {
    store.set('keepLogin', keep ? '1' : '0')
    if (saveEmail) { store.set('saveEmail', '1'); store.set('savedEmail', email) }
    else { store.del('saveEmail'); store.del('savedEmail') }
  }

  async function submit(e) {
    e.preventDefault()
    setErr(''); setBusy(true)
    const email = f.email.trim()
    try {
      await setPersistence(auth, keep ? browserLocalPersistence : browserSessionPersistence)
      if (!signup) {
        await signInWithEmailAndPassword(auth, email, f.password)
        remember(email)
      } else {
        signingUp = true
        const cred = await createUserWithEmailAndPassword(auth, email, f.password)
        try {
          await setDoc(doc(db, 'users', cred.user.uid), {
            name: f.name.trim(), role: f.role, code: f.code.trim(),
            familyId: 'main', createdAt: serverTimestamp()
          })
        } catch (e3) {
          console.error('프로필 생성 실패', e3)
          await cred.user.delete()
          throw new Error(e3.code === 'permission-denied'
            ? '가입 코드가 맞지 않아요. 가족에게 코드를 물어보세요.'
            : `프로필을 만들지 못했어요 (${e3.code || e3.message}). 잠시 뒤 다시 시도해 주세요.`)
        }
        remember(email)
        signingUp = false
        onDone()
      }
    } catch (e2) {
      console.error(e2)
      setErr(e2.code ? (AUTH_MSG[e2.code] || `오류가 발생했어요 (${e2.code})`) : e2.message)
    }
    signingUp = false
    setBusy(false)
  }

  return (
    <main className="login">
      <h1 className="logo">이거사줘</h1>
      <p className="sub">필요한 걸 적어두면 엄마 아빠가 답해줘요</p>
      <form className="card" onSubmit={submit}>
        <label>이메일
          <input type="email" autoComplete="username" value={f.email} onChange={set('email')} required />
        </label>
        <label>비밀번호
          <input type="password" autoComplete={signup ? 'new-password' : 'current-password'}
                 value={f.password} onChange={set('password')} required />
        </label>
        {signup && (
          <>
            <label>이름(별명)<input value={f.name} onChange={set('name')} required /></label>
            <label>나는
              <select value={f.role} onChange={set('role')}>
                <option value="child">자녀</option>
                <option value="parent">부모</option>
              </select>
            </label>
            <label>가입 코드<input value={f.code} onChange={set('code')} required /></label>
          </>
        )}
        <div className="checks">
          <label className="check">
            <input type="checkbox" checked={saveEmail} onChange={(e) => setSaveEmail(e.target.checked)} />
            이메일 저장
          </label>
          <label className="check">
            <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
            로그인 상태 유지
          </label>
        </div>
        {err && <p className="err">{err}</p>}
        <button className="btn main" disabled={busy}>{signup ? '가입하기' : '로그인'}</button>
        <button type="button" className="link" onClick={() => { setSignup(!signup); setErr('') }}>
          {signup ? '이미 계정이 있어요' : '처음이에요, 가입할게요'}
        </button>
      </form>
    </main>
  )
}

function Card({ it, children }) {
  const s = STATUS[it.status]
  return (
    <li className={`item ${urgent(it) ? 'urgent' : ''} ${closed(it) ? 'closed' : ''}`}
        style={{ '--who': colorOf(it.childName) }}>
      <div className="top">
        <strong className="title">{it.title}</strong>
        <span className={`sticker ${s.cls}`}>{s.icon} {s.label}</span>
      </div>
      <div className="meta">
        <span className="due">{dueLabel(it.dueDate)}</span>
        {it.memo && <span className="memo">{it.memo}</span>}
      </div>
      {it.status !== 'requested' && (it.parentEmoji || it.parentComment) && (
        <p className="bubble">{it.parentEmoji} {it.parentComment}</p>
      )}
      {children}
    </li>
  )
}

function Child({ uid, profile, items }) {
  const [f, setF] = useState({ title: '', dueDate: today(), memo: '' })
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  async function add(e) {
    e.preventDefault()
    if (!f.title.trim()) return
    await addDoc(collection(db, 'items'), {
      childId: uid, childName: profile.name, title: f.title.trim(), memo: f.memo.trim(),
      dueDate: f.dueDate, status: 'requested', parentEmoji: '', parentComment: '',
      receivedByChild: false, seenResponse: true, createdAt: serverTimestamp()
    })
    setF({ title: '', dueDate: today(), memo: '' })
  }
  const upd = (it, data) => updateDoc(doc(db, 'items', it.id), data)

  return (
    <>
      <form className="card add" onSubmit={add}>
        <h2>필요한 거 적기</h2>
        <input placeholder="예: 색종이 10장" value={f.title} onChange={set('title')} required />
        <label>언제까지 필요해?<input type="date" min={today()} value={f.dueDate} onChange={set('dueDate')} required /></label>
        <input placeholder="메모 (색깔, 크기 등)" value={f.memo} onChange={set('memo')} />
        <button className="btn main">사달라고 하기</button>
      </form>
      <ul className="list">
        {items.length === 0 && <p className="empty">아직 적은 게 없어요. 위에서 하나 적어보세요.</p>}
        {items.map((it) => (
          <Card key={it.id} it={it}>
            {!it.seenResponse && <span className="new">NEW</span>}
            <div className="actions">
              {it.status === 'done' && !it.receivedByChild && (
                <button className="btn main" onClick={() => upd(it, { receivedByChild: true, seenResponse: true })}>받았어요 👍</button>
              )}
              {!it.seenResponse && it.status !== 'done' && (
                <button className="btn" onClick={() => upd(it, { seenResponse: true })}>읽었어요</button>
              )}
              {it.status === 'requested' && (
                <button className="btn ghost" onClick={() => deleteDoc(doc(db, 'items', it.id))}>취소</button>
              )}
            </div>
          </Card>
        ))}
      </ul>
    </>
  )
}

function ParentItem({ it }) {
  const [comment, setComment] = useState(it.parentComment || '')
  const [emoji, setEmoji] = useState(it.parentEmoji || '')
  const respond = (status) => updateDoc(doc(db, 'items', it.id), {
    status, parentComment: comment.trim(), parentEmoji: emoji,
    seenResponse: false, respondedAt: serverTimestamp()
  })
  return (
    <Card it={it}>
      <div className="emojis">
        {['👍', '❤️', '🙏', '😅'].map((e) => (
          <button key={e} className={emoji === e ? 'on' : ''} onClick={() => setEmoji(emoji === e ? '' : e)}>{e}</button>
        ))}
      </div>
      <input placeholder="한마디 (예: 토요일에 사러 갈게)" value={comment} onChange={(e) => setComment(e.target.value)} />
      <div className="actions">
        <button className="btn" onClick={() => respond('seen')}>👀 확인했어요</button>
        <button className="btn main" onClick={() => respond('done')}>✅ 챙겨줬어요</button>
        <button className="btn" onClick={() => respond('declined')}>💬 보류</button>
        <button className="btn ghost" onClick={() => confirm('삭제할까요?') && deleteDoc(doc(db, 'items', it.id))}>삭제</button>
      </div>
    </Card>
  )
}

function Parent({ items }) {
  const groups = {}
  items.forEach((it) => { (groups[it.childId] ||= { name: it.childName, list: [] }).list.push(it) })
  const fresh = items.filter((i) => i.status === 'requested').length
  const hot = items.filter(urgent).length
  return (
    <>
      <div className="banner">
        <div><b>{fresh}</b>새 요청</div>
        <div className={hot ? 'hot' : ''}><b>{hot}</b>급한 것</div>
      </div>
      {items.length === 0 && <p className="empty">아직 등록된 준비물이 없어요.</p>}
      {Object.entries(groups).map(([id, g]) => (
        <section key={id}>
          <h2 className="kid" style={{ '--who': colorOf(g.name) }}>{g.name}</h2>
          <ul className="list">{g.list.map((it) => <ParentItem key={it.id} it={it} />)}</ul>
        </section>
      ))}
    </>
  )
}

export default function App() {
  const [user, setUser] = useState(undefined)
  const [profile, setProfile] = useState(null)
  const [items, setItems] = useState([])

  useEffect(() => onAuthStateChanged(auth, (u) => {
    if (signingUp) return
    setUser(u)
    if (!u) setProfile(null)
  }), [])
  useEffect(() => {
    if (!user) return
    return onSnapshot(doc(db, 'users', user.uid), (s) => setProfile(s.exists() ? s.data() : null))
  }, [user])
  useEffect(() => {
    if (!user || !profile) return
    const base = collection(db, 'items')
    const q = profile.role === 'parent' ? query(base) : query(base, where('childId', '==', user.uid))
    return onSnapshot(q, (s) => setItems(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort(cmp)),
      (e) => console.error(e))
  }, [user, profile])

  if (user === undefined) return <p className="empty">불러오는 중…</p>
  if (!user) return <Login onDone={() => setUser(auth.currentUser)} />
  if (!profile) return <p className="empty">프로필을 준비하고 있어요…</p>

  return (
    <div className="app">
      <header>
        <h1 className="logo small">이거사줘</h1>
        <span className="who" style={{ '--who': colorOf(profile.name) }}>{profile.name}</span>
        <button className="link" onClick={() => signOut(auth)}>로그아웃</button>
      </header>
      {profile.role === 'parent'
        ? <Parent items={items} />
        : <Child uid={user.uid} profile={profile} items={items} />}
    </div>
  )
}
