import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  AuthError,
  EmailAuthProvider,
  User,
  onAuthStateChanged,
  reauthenticateWithCredential,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
} from 'firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  AlertCircle,
  Check,
  ClipboardList,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  LogIn,
  LogOut,
  MapPin,
  MessageCircle,
  Phone,
  Printer,
  Save,
  Search,
  ShieldAlert,
  ShieldCheck,
  User as UserIcon,
  Wrench,
  X,
} from 'lucide-react';
import { auth, db } from './firebase';
import {
  BookingDetails,
  BookingStatus,
  BookingWorkStage,
  ServiceRateItem,
  SubAdminAvatarColor,
  SubAdminProfile,
} from './types';

type TabId = 'orders' | 'profile' | 'rates';

const STATUS_LABELS: Record<BookingStatus, string> = {
  pending: 'নতুন (Pending)',
  called: 'চলমান / কল হয়েছে',
  completed: 'সম্পন্ন',
  cancelled: 'বাতিল',
};

const STATUS_COLORS: Record<BookingStatus, string> = {
  pending: 'text-amber-700 bg-amber-50 border-amber-200',
  called: 'text-blue-700 bg-blue-50 border-blue-200',
  completed: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  cancelled: 'text-slate-600 bg-slate-100 border-slate-200',
};

const WORK_STAGE_LABELS: Record<BookingWorkStage, string> = {
  new: 'নতুন অ্যাসাইন',
  accepted: 'কাজ গ্রহণ করা হয়েছে',
  on_the_way: 'কাস্টমারের পথে',
  repairing: 'রিপেয়ার চলছে',
  completed: 'কাজ সম্পন্ন',
  cancelled: 'বাতিল',
};

const WORK_STAGE_COLORS: Record<BookingWorkStage, string> = {
  new: 'text-amber-700 bg-amber-50 border-amber-200',
  accepted: 'text-blue-700 bg-blue-50 border-blue-200',
  on_the_way: 'text-indigo-700 bg-indigo-50 border-indigo-200',
  repairing: 'text-violet-700 bg-violet-50 border-violet-200',
  completed: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  cancelled: 'text-slate-600 bg-slate-100 border-slate-200',
};

const AVATAR_OPTIONS: Array<{ value: SubAdminAvatarColor; label: string; bg: string }> = [
  { value: 'blue', label: 'নীল', bg: 'bg-blue-600' },
  { value: 'emerald', label: 'সবুজ', bg: 'bg-emerald-600' },
  { value: 'slate', label: 'ডার্ক স্লেট', bg: 'bg-slate-800' },
  { value: 'amber', label: 'সোনালি', bg: 'bg-amber-600' },
  { value: 'violet', label: 'বেগুনি', bg: 'bg-violet-600' },
];

function toBanglaDigits(value: string | number): string {
  const digits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  return String(value).replace(/\d/g, (d) => digits[Number(d)] ?? d);
}

function toAuthEmail(input: string): string {
  const trimmed = input.trim().toLowerCase();
  if (trimmed.includes('@')) return trimmed;
  const clean = trimmed.replace(/[^a-z0-9_.-]/g, '').slice(0, 32);
  return `${clean}@subadmin.fastfix.local`;
}

function getWhatsAppUrl(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const intl = digits.startsWith('88') ? digits : digits.startsWith('0') ? `88${digits}` : `880${digits}`;
  return `https://wa.me/${intl}`;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'SA';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

export default function App() {
  const [brandTitle, setBrandTitle] = useState("Fastfix Mobile Lab");
  const [contactPhone, setContactPhone] = useState('');
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [authReady, setAuthReady] = useState(false);

  const [usernameInput, setUsernameInput] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return (params.get('u') ?? '').trim();
  });
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const [profile, setProfile] = useState<SubAdminProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState<'missing' | 'suspended' | null>(null);

  const [activeTab, setActiveTab] = useState<TabId>('orders');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [orders, setOrders] = useState<BookingDetails[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | BookingStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [receiptOrder, setReceiptOrder] = useState<BookingDetails | null>(null);

  const [services, setServices] = useState<ServiceRateItem[]>([]);

  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editArea, setEditArea] = useState('');
  const [editSpecialty, setEditSpecialty] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editAvatarColor, setEditAvatarColor] = useState<SubAdminAvatarColor>('blue');
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    const unsubSite = onSnapshot(doc(db, 'settings', 'site'), (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        if (d.brandTitle) setBrandTitle(String(d.brandTitle));
        if (d.contactPhone) setContactPhone(String(d.contactPhone));
      }
    });
    const unsubServices = onSnapshot(
      query(collection(db, 'services'), orderBy('order', 'asc')),
      (snap) => {
        setServices(
          snap.docs.map((d) => ({
            id: d.id,
            name: String(d.data().name ?? ''),
            subtitle: String(d.data().subtitle ?? ''),
            shopPriceText: String(d.data().shopPriceText ?? ''),
            ourPriceText: String(d.data().ourPriceText ?? ''),
            active: Boolean(d.data().active ?? true),
          }))
        );
      }
    );
    return () => {
      unsubSite();
      unsubServices();
    };
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
      if (!nextUser) {
        setProfile(null);
        setProfileLoading(false);
        setProfileError(null);
        setOrders([]);
        setOrdersLoading(false);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!authReady || !user) return;
    setProfileLoading(true);
    setProfileError(null);

    const unsub = onSnapshot(
      doc(db, 'subAdmins', user.uid),
      (snap) => {
        if (!snap.exists()) {
          setProfile(null);
          setProfileError('missing');
          setProfileLoading(false);
          return;
        }
        const d = snap.data();
        const createdTs = d.createdAt?.toDate ? d.createdAt.toDate() : null;
        const p: SubAdminProfile = {
          uid: snap.id,
          username: String(d.username ?? ''),
          authEmail: String(d.authEmail ?? ''),
          name: String(d.name ?? ''),
          phone: String(d.phone ?? ''),
          area: String(d.area ?? ''),
          specialty: String(d.specialty ?? ''),
          bio: String(d.bio ?? ''),
          avatarColor: (d.avatarColor as SubAdminAvatarColor) ?? 'blue',
          role: 'sub_admin',
          active: Boolean(d.active),
          createdAtText: createdTs ? createdTs.toLocaleDateString('bn-BD') : 'সক্রিয়',
        };
        setProfile(p);
        setProfileError(p.active ? null : 'suspended');
        setEditName(p.name);
        setEditPhone(p.phone);
        setEditArea(p.area);
        setEditSpecialty(p.specialty);
        setEditBio(p.bio);
        setEditAvatarColor(p.avatarColor);
        setProfileLoading(false);
      },
      () => {
        setProfile(null);
        setProfileError('missing');
        setProfileLoading(false);
      }
    );
    return () => unsub();
  }, [authReady, user]);

  useEffect(() => {
    if (!authReady || !user || !profile || !profile.active) {
      setOrders([]);
      setOrdersLoading(false);
      return;
    }

    setOrdersLoading(true);
    const q = query(collection(db, 'bookings'), where('assignedSubAdminUid', '==', user.uid));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: BookingDetails[] = snap.docs.map((docSnap) => {
          const d = docSnap.data();
          const ts = d.createdAt?.toDate ? d.createdAt.toDate() : null;
          return {
            id: docSnap.id,
            bookingCode: String(d.bookingCode ?? ''),
            customerName: String(d.customerName ?? ''),
            phoneNumber: String(d.phoneNumber ?? ''),
            area: String(d.area ?? ''),
            phoneModel: String(d.phoneModel ?? ''),
            serviceId: String(d.serviceId ?? ''),
            serviceName: String(d.serviceName ?? ''),
            priceSummary: String(d.priceSummary ?? ''),
            status: (d.status as BookingStatus) ?? 'pending',
            adminNote: String(d.adminNote ?? ''),
            workStage: (d.workStage as BookingWorkStage) ?? 'new',
            assignedSubAdminUid: String(d.assignedSubAdminUid ?? ''),
            latitude: typeof d.latitude === 'number' ? d.latitude : undefined,
            longitude: typeof d.longitude === 'number' ? d.longitude : undefined,
            googleMapsUrl: typeof d.googleMapsUrl === 'string' ? d.googleMapsUrl : undefined,
            createdAtMs: ts ? ts.getTime() : 0,
            createdAtText: ts
              ? ts.toLocaleString('bn-BD', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : 'এইমাত্র',
          };
        });
        list.sort((a, b) => b.createdAtMs - a.createdAtMs);
        setOrders(list);
        setOrdersLoading(false);
      },
      () => {
        setOrdersLoading(false);
        showNotice('error', 'অর্ডার লোড করতে সমস্যা হয়েছে।');
      }
    );
    return () => unsub();
  }, [authReady, user, profile]);

  function showNotice(type: 'success' | 'error', text: string) {
    setFeedback({ type, text });
    window.setTimeout(() => {
      setFeedback((prev) => (prev?.text === text ? null : prev));
    }, 4000);
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    if (isLoggingIn) return;
    setLoginError(null);
    if (usernameInput.trim().length < 3 || passwordInput.length < 6) {
      setLoginError('সঠিক ইউজার আইডি ও কমপক্ষে ৬ অক্ষরের পাসওয়ার্ড দিন।');
      return;
    }
    setIsLoggingIn(true);
    try {
      await signInWithEmailAndPassword(auth, toAuthEmail(usernameInput), passwordInput);
      setPasswordInput('');
    } catch (error) {
      const code = (error as Partial<AuthError>)?.code ?? '';
      if (code === 'auth/operation-not-allowed') {
        setLoginError('Firebase Console-এ Email/Password লগইন চালু করা নেই।');
      } else {
        setLoginError('ইউজার আইডি বা পাসওয়ার্ড সঠিক নয়।');
      }
    } finally {
      setIsLoggingIn(false);
    }
  }

  async function handleOrderUpdate(
    order: BookingDetails,
    updates: { status?: BookingStatus; workStage?: BookingWorkStage; adminNote?: string }
  ) {
    if (!profile) return;
    if (order.status === 'completed' || order.status === 'cancelled') {
      showNotice('error', 'সম্পন্ন বা বাতিল অর্ডার পরিবর্তন করা যাবে না।');
      return;
    }
    const nextStatus = updates.status ?? order.status;
    const nextStage =
      updates.workStage ??
      (nextStatus === 'completed'
        ? 'completed'
        : nextStatus === 'cancelled'
          ? 'cancelled'
          : order.workStage);
    const nextNote = (updates.adminNote ?? noteDrafts[order.id] ?? order.adminNote).trim().slice(0, 300);

    try {
      await updateDoc(doc(db, 'bookings', order.id), {
        status: nextStatus,
        workStage: nextStage,
        adminNote: nextNote,
        updatedByName: `${profile.name} (@${profile.username})`.slice(0, 100),
        updatedAt: serverTimestamp(),
      });
      showNotice('success', `#${order.bookingCode} আপডেট হয়েছে।`);
    } catch {
      showNotice('error', 'অর্ডার আপডেট করা যায়নি।');
    }
  }

  async function handleSaveProfile(e: FormEvent) {
    e.preventDefault();
    if (!profile) return;
    if (editName.trim().length < 2 || editArea.trim().length < 2 || editSpecialty.trim().length < 2) {
      showNotice('error', 'নাম, এলাকা ও দক্ষতা সঠিকভাবে লিখুন।');
      return;
    }
    setSavingProfile(true);
    try {
      await updateDoc(doc(db, 'subAdmins', profile.uid), {
        name: editName.trim().slice(0, 100),
        phone: editPhone.trim().slice(0, 25),
        area: editArea.trim().slice(0, 60),
        specialty: editSpecialty.trim().slice(0, 100),
        bio: editBio.trim().slice(0, 300),
        avatarColor: editAvatarColor,
        updatedAt: serverTimestamp(),
      });
      showNotice('success', 'প্রোফাইল সেভ হয়েছে।');
    } catch {
      showNotice('error', 'প্রোফাইল সেভ করা যায়নি।');
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    if (!user?.email) return;
    if (newPassword.length < 6 || newPassword !== confirmPassword) {
      showNotice('error', 'নতুন পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের এবং দুটি একই হতে হবে।');
      return;
    }
    setChangingPassword(true);
    try {
      const cred = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, cred);
      await updatePassword(user, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      showNotice('success', 'পাসওয়ার্ড পরিবর্তন হয়েছে।');
    } catch {
      showNotice('error', 'বর্তমান পাসওয়ার্ড সঠিক নয় বা আপডেট ব্যর্থ হয়েছে।');
    } finally {
      setChangingPassword(false);
    }
  }

  const stats = useMemo(() => {
    const total = orders.length;
    const pending = orders.filter((o) => o.status === 'pending').length;
    const active = orders.filter((o) => o.status === 'called').length;
    const completed = orders.filter((o) => o.status === 'completed').length;
    return {
      total,
      pending,
      active,
      completed,
      rate: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  }, [orders]);

  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      if (statusFilter !== 'all' && o.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        return (
          o.customerName.toLowerCase().includes(q) ||
          o.phoneNumber.includes(q) ||
          o.bookingCode.toLowerCase().includes(q) ||
          o.phoneModel.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [orders, statusFilter, searchQuery]);

  const avatarBg = AVATAR_OPTIONS.find((a) => a.value === profile?.avatarColor)?.bg ?? 'bg-blue-600';

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <header className="print:hidden sticky top-0 z-30 h-14 md:h-16 bg-white/95 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-5xl mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="font-latin text-base sm:text-lg font-bold text-slate-900 truncate">
            {brandTitle} · Sub-Admin
          </div>
          {user && (
            <button
              type="button"
              onClick={() => void signOut(auth)}
              className="min-h-[38px] px-3.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-xs sm:text-sm font-semibold rounded-xl inline-flex items-center gap-1.5"
            >
              <LogOut className="w-4 h-4" />
              <span>লগআউট</span>
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 print:hidden">
        {!authReady ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-sm text-slate-600">
            লোড হচ্ছে...
          </div>
        ) : !user ? (
          <div className="max-w-md mx-auto py-8">
            <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-xs space-y-5">
              <div className="text-center space-y-1.5">
                <p className="font-latin text-xs font-bold uppercase tracking-wider text-blue-700">
                  Sub-Admin Workspace
                </p>
                <h1 className="text-2xl font-bold text-slate-900">সাব-এডমিন লগইন</h1>
                <p className="text-sm text-slate-600">
                  আপনার ইউজার আইডি ও পাসওয়ার্ড দিয়ে লগইন করুন।
                </p>
              </div>
              {loginError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs sm:text-sm font-medium text-red-700 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{loginError}</span>
                </div>
              )}
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">ইউজার আইডি</label>
                  <input
                    type="text"
                    required
                    value={usernameInput}
                    onChange={(e) => setUsernameInput(e.target.value)}
                    placeholder="যেমন: rahim01"
                    className="font-latin w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">পাসওয়ার্ড</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={passwordInput}
                      onChange={(e) => setPasswordInput(e.target.value)}
                      className="font-latin w-full min-h-[44px] pl-3.5 pr-11 py-2 rounded-xl border border-slate-300 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((p) => !p)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={isLoggingIn}
                  className="w-full min-h-[46px] bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl inline-flex items-center justify-center gap-2"
                >
                  <LogIn className="w-4 h-4" />
                  <span>{isLoggingIn ? 'লগইন হচ্ছে...' : 'লগইন করুন'}</span>
                </button>
              </form>
            </div>
          </div>
        ) : profileLoading ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-sm text-slate-600">
            প্রোফাইল লোড হচ্ছে...
          </div>
        ) : !profile || profileError !== null ? (
          <div className="max-w-md mx-auto bg-white border border-slate-200 rounded-2xl p-6 text-center space-y-4">
            <ShieldAlert className="w-10 h-10 text-red-600 mx-auto" />
            <h1 className="text-lg font-bold text-slate-900">
              {profileError === 'suspended' ? 'অ্যাকাউন্ট স্থগিত' : 'প্রোফাইল পাওয়া যায়নি'}
            </h1>
            <p className="text-sm text-slate-600">
              মেইন এডমিনের সাথে যোগাযোগ করুন।
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className={`w-12 h-12 rounded-2xl ${avatarBg} text-white font-latin font-bold flex items-center justify-center shrink-0`}>
                  {getInitials(profile.name)}
                </div>
                <div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="font-latin font-semibold text-blue-700">@{profile.username}</span>
                    <span>·</span>
                    <span>{profile.area}</span>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      সক্রিয়
                    </span>
                  </div>
                  <h1 className="text-xl font-bold text-slate-900">{profile.name}</h1>
                </div>
              </div>
              <div className="inline-flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => setActiveTab('orders')}
                  className={`px-3.5 py-2 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 ${activeTab === 'orders' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'}`}
                >
                  <ClipboardList className="w-4 h-4" />
                  <span>অর্ডার ({toBanglaDigits(stats.total)})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('profile')}
                  className={`px-3.5 py-2 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 ${activeTab === 'profile' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'}`}
                >
                  <UserIcon className="w-4 h-4" />
                  <span>প্রোফাইল</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('rates')}
                  className={`px-3.5 py-2 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 ${activeTab === 'rates' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'}`}
                >
                  <Wrench className="w-4 h-4" />
                  <span>রেট</span>
                </button>
              </div>
            </section>

            {feedback && (
              <div className={`p-3.5 rounded-xl border text-sm font-medium flex items-center gap-2 ${feedback.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-700'}`}>
                {feedback.type === 'success' && <Check className="w-4 h-4" />}
                <span>{feedback.text}</span>
              </div>
            )}

            {activeTab === 'orders' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-white border border-slate-200 rounded-2xl p-4">
                    <p className="text-xs text-slate-500">মোট অর্ডার</p>
                    <p className="text-2xl font-bold tabular-nums">{toBanglaDigits(stats.total)}</p>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-2xl p-4">
                    <p className="text-xs text-slate-500">নতুন</p>
                    <p className="text-2xl font-bold text-amber-700 tabular-nums">{toBanglaDigits(stats.pending)}</p>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-2xl p-4">
                    <p className="text-xs text-slate-500">চলমান</p>
                    <p className="text-2xl font-bold text-blue-700 tabular-nums">{toBanglaDigits(stats.active)}</p>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-2xl p-4">
                    <p className="text-xs text-slate-500">সম্পন্ন</p>
                    <p className="text-2xl font-bold text-emerald-700 tabular-nums">{toBanglaDigits(stats.completed)}</p>
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-1.5">
                    {([['all', 'সব'], ['pending', 'নতুন'], ['called', 'চলমান'], ['completed', 'সম্পন্ন'], ['cancelled', 'বাতিল']] as const).map(([val, lbl]) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setStatusFilter(val)}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-xl border ${statusFilter === val ? 'bg-blue-600 border-blue-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-600'}`}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>
                  <div className="relative w-full sm:w-64">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="search"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="নাম, নাম্বার বা কোড খুঁজুন..."
                      className="w-full min-h-[38px] pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                    />
                  </div>
                </div>

                {ordersLoading ? (
                  <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-sm text-slate-500">
                    অর্ডার লোড হচ্ছে...
                  </div>
                ) : filteredOrders.length === 0 ? (
                  <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-sm text-slate-500">
                    কোনো অর্ডার পাওয়া যায়নি।
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredOrders.map((order) => {
                      const isLocked = order.status === 'completed' || order.status === 'cancelled';
                      const noteVal = noteDrafts[order.id] ?? order.adminNote;
                      return (
                        <article key={order.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                            <div className="text-xs text-slate-600 flex items-center gap-2">
                              <span className="font-latin font-bold text-slate-900">#{order.bookingCode}</span>
                              <span>·</span>
                              <span>{order.createdAtText}</span>
                              <span>·</span>
                              <span className="font-semibold">{order.area}</span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <select
                                disabled={isLocked}
                                value={order.workStage}
                                onChange={(e) => void handleOrderUpdate(order, { workStage: e.target.value as BookingWorkStage })}
                                className={`px-2.5 py-1 rounded-lg border text-xs font-semibold ${WORK_STAGE_COLORS[order.workStage]}`}
                              >
                                {(Object.keys(WORK_STAGE_LABELS) as BookingWorkStage[]).map((k) => (
                                  <option key={k} value={k}>{WORK_STAGE_LABELS[k]}</option>
                                ))}
                              </select>
                              <select
                                disabled={isLocked}
                                value={order.status}
                                onChange={(e) => void handleOrderUpdate(order, { status: e.target.value as BookingStatus })}
                                className={`px-2.5 py-1 rounded-lg border text-xs font-semibold ${STATUS_COLORS[order.status]}`}
                              >
                                {(Object.keys(STATUS_LABELS) as BookingStatus[]).map((k) => (
                                  <option key={k} value={k}>{STATUS_LABELS[k]}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                          <div className="p-4 space-y-3">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <div>
                                <h3 className="text-base font-bold text-slate-900">
                                  {order.customerName} — <span className="font-latin">{order.phoneModel}</span>
                                </h3>
                                <p className="text-sm text-slate-600">
                                  {order.serviceName} · <span className="text-blue-700 font-semibold">{order.priceSummary}</span>
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <a href={`tel:${order.phoneNumber}`} className="px-3 py-2 bg-blue-600 text-white text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 tabular-nums">
                                  <Phone className="w-3.5 h-3.5" />
                                  <span>{order.phoneNumber}</span>
                                </a>
                                <a href={getWhatsAppUrl(order.phoneNumber)} target="_blank" rel="noopener noreferrer" className="px-3 py-2 bg-emerald-600 text-white text-xs font-semibold rounded-xl inline-flex items-center gap-1.5">
                                  <MessageCircle className="w-3.5 h-3.5" />
                                  <span>WhatsApp</span>
                                </a>
                                {order.latitude !== undefined && order.longitude !== undefined && (
                                  <a
                                    href={order.googleMapsUrl ?? `https://www.google.com/maps?q=${order.latitude},${order.longitude}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-3 py-2 bg-slate-100 text-slate-800 text-xs font-semibold rounded-xl inline-flex items-center gap-1.5"
                                  >
                                    <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                                    <span>ম্যাপ</span>
                                    <ExternalLink className="w-3 h-3" />
                                  </a>
                                )}
                                <button
                                  type="button"
                                  onClick={() => setReceiptOrder(order)}
                                  className="px-3 py-2 bg-slate-900 text-white text-xs font-semibold rounded-xl inline-flex items-center gap-1.5"
                                >
                                  <Printer className="w-3.5 h-3.5" />
                                  <span>রিসিভ</span>
                                </button>
                              </div>
                            </div>
                            <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-slate-100">
                              <input
                                type="text"
                                maxLength={300}
                                disabled={isLocked}
                                value={noteVal}
                                onChange={(e) => setNoteDrafts((prev) => ({ ...prev, [order.id]: e.target.value }))}
                                placeholder="কাজের নোট লিখুন..."
                                className="flex-1 min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 text-sm"
                              />
                              {!isLocked && (
                                <button
                                  type="button"
                                  onClick={() => void handleOrderUpdate(order, { adminNote: noteVal })}
                                  className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-xl inline-flex items-center gap-1.5"
                                >
                                  <Save className="w-3.5 h-3.5" />
                                  <span>নোট সেভ</span>
                                </button>
                              )}
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'profile' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-14 h-14 rounded-2xl ${avatarBg} text-white font-latin font-bold text-lg flex items-center justify-center`}>
                      {getInitials(profile.name)}
                    </div>
                    <div>
                      <h2 className="text-lg font-bold">{profile.name}</h2>
                      <p className="font-latin text-xs text-blue-700 font-semibold">@{profile.username}</p>
                      <p className="text-xs text-slate-500">{profile.specialty}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-100">
                    <div>
                      <p className="text-[11px] text-slate-500">অর্ডার</p>
                      <p className="text-lg font-bold tabular-nums">{toBanglaDigits(stats.total)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-500">সম্পন্ন</p>
                      <p className="text-lg font-bold text-emerald-700 tabular-nums">{toBanglaDigits(stats.completed)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-500">সফলতা</p>
                      <p className="text-lg font-bold text-blue-700 tabular-nums">{toBanglaDigits(stats.rate)}%</p>
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-7 space-y-5">
                  <form onSubmit={handleSaveProfile} className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
                    <h2 className="text-base font-bold">প্রোফাইল তথ্য এডিট</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input type="text" required value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="নাম" className="min-h-[40px] px-3 rounded-xl border border-slate-300 text-sm" />
                      <input type="tel" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder="ফোন" className="font-latin min-h-[40px] px-3 rounded-xl border border-slate-300 text-sm" />
                      <input type="text" required value={editArea} onChange={(e) => setEditArea(e.target.value)} placeholder="এলাকা" className="min-h-[40px] px-3 rounded-xl border border-slate-300 text-sm" />
                      <input type="text" required value={editSpecialty} onChange={(e) => setEditSpecialty(e.target.value)} placeholder="দক্ষতা" className="min-h-[40px] px-3 rounded-xl border border-slate-300 text-sm" />
                      <textarea rows={2} value={editBio} onChange={(e) => setEditBio(e.target.value)} placeholder="বায়ো" className="sm:col-span-2 px-3 py-2 rounded-xl border border-slate-300 text-sm" />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {AVATAR_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setEditAvatarColor(opt.value)}
                          className={`px-3 py-1.5 rounded-xl border text-xs font-semibold ${editAvatarColor === opt.value ? 'bg-slate-900 text-white border-slate-900' : 'bg-white border-slate-200'}`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    <button type="submit" disabled={savingProfile} className="px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl">
                      {savingProfile ? 'সেভ হচ্ছে...' : 'প্রোফাইল সেভ করুন'}
                    </button>
                  </form>

                  <form onSubmit={handleChangePassword} className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
                    <h2 className="text-base font-bold flex items-center gap-2">
                      <KeyRound className="w-4 h-4" />
                      <span>পাসওয়ার্ড পরিবর্তন</span>
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <input type="password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="বর্তমান পাসওয়ার্ড" className="min-h-[40px] px-3 rounded-xl border border-slate-300 text-sm" />
                      <input type="password" required minLength={6} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="নতুন পাসওয়ার্ড" className="min-h-[40px] px-3 rounded-xl border border-slate-300 text-sm" />
                      <input type="password" required minLength={6} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="নিশ্চিত করুন" className="min-h-[40px] px-3 rounded-xl border border-slate-300 text-sm" />
                    </div>
                    <button type="submit" disabled={changingPassword} className="px-5 py-2 bg-slate-900 text-white text-sm font-semibold rounded-xl">
                      {changingPassword ? 'আপডেট হচ্ছে...' : 'পাসওয়ার্ড আপডেট'}
                    </button>
                  </form>
                </div>
              </div>
            )}

            {activeTab === 'rates' && (
              <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
                <h2 className="text-base font-bold">সার্ভিস ফিক্সড রেট</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {services.filter((s) => s.active).map((s) => (
                    <div key={s.id} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
                      <div>
                        <p className="font-latin text-sm font-bold">{s.name}</p>
                        <p className="text-xs text-slate-500">{s.subtitle}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-blue-700">{s.ourPriceText}</p>
                        <p className="text-[11px] text-slate-400 line-through">{s.shopPriceText}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {receiptOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4 print:static print:bg-white print:p-0">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 print:shadow-none print:max-w-none">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 print:hidden">
              <h3 className="text-base font-bold">কাস্টমার রিসিভ (#{receiptOrder.bookingCode})</h3>
              <button type="button" onClick={() => setReceiptOrder(null)} className="p-1 text-slate-500 hover:text-slate-900">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-2 text-sm">
              <p className="text-lg font-bold">{brandTitle}</p>
              {contactPhone && <p className="text-xs text-slate-500">হটলাইন: {contactPhone}</p>}
              <div className="border-t border-b border-slate-200 py-3 space-y-1">
                <p><strong>অর্ডার কোড:</strong> #{receiptOrder.bookingCode}</p>
                <p><strong>গ্রাহক:</strong> {receiptOrder.customerName} ({receiptOrder.phoneNumber})</p>
                <p><strong>এলাকা:</strong> {receiptOrder.area}</p>
                <p><strong>ডিভাইস:</strong> {receiptOrder.phoneModel}</p>
                <p><strong>সমস্যা:</strong> {receiptOrder.serviceName}</p>
                <p><strong>দাম:</strong> {receiptOrder.priceSummary}</p>
                {receiptOrder.adminNote && <p><strong>টেকনিশিয়ান নোট:</strong> {receiptOrder.adminNote}</p>}
              </div>
            </div>
            <div className="flex justify-end gap-2 print:hidden">
              <button type="button" onClick={() => setReceiptOrder(null)} className="px-4 py-2 border border-slate-200 rounded-xl text-sm">
                বন্ধ করুন
              </button>
              <button type="button" onClick={() => window.print()} className="px-4 py-2 bg-slate-900 text-white rounded-xl text-sm font-semibold inline-flex items-center gap-1.5">
                <Printer className="w-4 h-4" />
                <span>প্রিন্ট করুন</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
