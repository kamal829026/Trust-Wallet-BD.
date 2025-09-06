const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5000;

// ডেটা স্টোরেজের জন্য মেমোরিতে অবজেক্ট (অস্থায়ী)
let users = [];
let payments = [];
let reviews = [];
let messages = []; // মেসেজ স্টোরেজ
// Admin user initialization
let adminUsers = [];

// Initialize admin user and test user on server start
const initializeAdmin = async () => {
  try {
    const adminHashedPassword = await bcrypt.hash('891994', 10);
    const testUserHashedPassword = await bcrypt.hash('123456', 10);
    
    adminUsers = [
      { 
        id: 1, 
        email: 'admin1994@admin.com', 
        password: adminHashedPassword, 
        name: 'Admin' 
      }
    ];
    
    // Create a test user for easier testing
    users.push({
      id: 1,
      userId: 'U000001',
      name: 'Test User',
      phone: '01712345678',
      email: 'test@test.com',
      password: testUserHashedPassword,
      originalPassword: '123456',
      balance: 0,
      joinedAt: new Date()
    });
    
    console.log('Admin user initialized successfully');
    console.log('Admin Login: admin1994@admin.com');
    console.log('Admin Password: 891994');
    console.log('Test User Login: test@test.com');
    console.log('Test User Password: 123456');
    console.log('Environment:', process.env.NODE_ENV || 'development');
  } catch (error) {
    console.error('Error initializing admin:', error);
  }
};

// Admin will be initialized when server starts

// মিডলওয়্যার সেটআপ
// Static file serving with proper headers for production
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0,
  setHeaders: (res, path) => {
    if (path.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
    }
  }
}));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
// Trust proxy for production (Render uses proxy)
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

app.use(session({
  secret: process.env.SESSION_SECRET || 'your_session_secret_key_2024',
  resave: false, // Don't save session if unmodified
  saveUninitialized: false, // Don't create session until something stored
  rolling: true, // প্রতি রিকুয়েস্টে সেশন এক্সটেন্ড করার জন্য
  cookie: { 
    maxAge: 24 * 60 * 60 * 1000, // ২৪ ঘন্টা (মিলিসেকেন্ডে)
    secure: process.env.NODE_ENV === 'production', // Production এ HTTPS এর জন্য
    httpOnly: true, // নিরাপত্তার জন্য
    sameSite: process.env.NODE_ENV === 'production' ? 'lax' : 'lax' // CSRF protection
  },
  name: 'sessionId' // কাস্টম সেশন নাম
}));

app.use(passport.initialize());
app.use(passport.session());

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// CSS route as fallback for production
app.get('/style.css', (req, res) => {
  res.type('text/css');
  res.sendFile(path.join(__dirname, 'public', 'style.css'));
});

// Debug route to show admin credentials (remove in production)
app.get('/debug/admin', (req, res) => {
  res.json({
    adminUsersCount: adminUsers.length,
    adminEmail: adminUsers[0]?.email,
    testUserEmail: users.find(u => u.email === 'test@test.com')?.email,
    environment: process.env.NODE_ENV || 'development',
    message: 'Use these exact credentials for login'
  });
});

// আপলোড ডিরেক্টরি তৈরি করা
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// মাল্টার কনফিগারেশন
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ storage: storage });

// পাসপোর্ট স্ট্র্যাটেজি
passport.use(new LocalStrategy(
  { usernameField: 'email' },
  async (email, password, done) => {
    const user = users.find(u => u.email === email);
    if (!user) {
      return done(null, false, { message: 'ভুল ইমেইল বা পাসওয়ার্ড' });
    }
    
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return done(null, false, { message: 'ভুল ইমেইল বা পাসওয়ার্ড' });
    }
    
    return done(null, user);
  }
));

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser((id, done) => {
  const user = users.find(u => u.id === id);
  done(null, user);
});

// রুটস
app.get('/', (req, res) => {
  res.render('login', { message: null });
});

app.get('/login', (req, res) => {
  res.render('login', { message: null });
});

app.get('/register', (req, res) => {
  res.render('register', { message: null });
});

app.post('/register', async (req, res) => {
  const { name, phone, email, password } = req.body;
  
  // চেক করা যে ইউজার আগে থেকেই আছে কিনা
  const existingUser = users.find(u => u.email === email);
  if (existingUser) {
    return res.render('register', { message: 'এই ইমেইল দিয়ে আগে থেকেই একাউন্ট আছে' });
  }
  
  // পাসওয়ার্ড হ্যাশ করা
  const hashedPassword = await bcrypt.hash(password, 10);
  
  // নতুন ইউজার তৈরি করা
  const newUser = {
    id: users.length + 1,
    userId: `U${Date.now().toString().slice(-6)}${(users.length + 1).toString().padStart(3, '0')}`, // ইউনিক ইউজার আইডি
    name,
    phone,
    email,
    password: hashedPassword,
    originalPassword: password, // এডমিনের জন্য আসল পাসওয়ার্ড
    balance: 0,
    joinedAt: new Date()
  };
  
  users.push(newUser);
  res.redirect('/login');
});

app.post('/login', (req, res, next) => {
  console.log('Login attempt:', req.body.email);
  console.log('Session ID:', req.sessionID);
  
  passport.authenticate('local', (err, user, info) => {
    if (err) {
      console.error('Login error:', err);
      return next(err);
    }
    
    if (!user) {
      console.log('Login failed:', info);
      return res.render('login', { message: info.message || 'লগইন ব্যর্থ' });
    }
    
    req.logIn(user, (err) => {
      if (err) {
        console.error('Session login error:', err);
        return next(err);
      }
      
      console.log('Login successful for user:', user.email);
      console.log('Session after login:', req.session);
      return res.redirect('/dashboard');
    });
  })(req, res, next);
});

app.get('/dashboard', (req, res) => {
  console.log('Dashboard access attempt');
  console.log('User authenticated:', !!req.user);
  console.log('Session:', req.session);
  console.log('Session ID:', req.sessionID);
  
  if (!req.user) {
    console.log('User not authenticated, redirecting to login');
    return res.redirect('/login');
  }
  
  console.log('User authenticated, rendering dashboard');
  res.render('dashboard', { user: req.user });
});

app.get('/payment', (req, res) => {
  if (!req.user) {
    return res.redirect('/login');
  }
  res.render('payment', { user: req.user });
});

app.post('/payment', (req, res) => {
  if (!req.user) {
    return res.redirect('/login');
  }
  
  const { senderNumber, amount } = req.body;
  
  // পেমেন্ট রেকর্ড সেভ করা (কিন্তু ব্যালেন্স যোগ করা হবে না)
  const payment = {
    id: payments.length + 1,
    userId: req.user.id,
    senderNumber,
    amount: parseInt(amount),
    receiveNumber: '01846735445', // যে নাম্বারে টাকা পাঠানো হয়েছে
    status: 'pending',
    submittedAt: new Date()
  };
  
  payments.push(payment);
  
  // সফল সাবমিশনের মেসেজ দেখিয়ে ড্যাশবোর্ডে ফিরে যাওয়া
  res.render('dashboard', { 
    user: req.user, 
    paymentMessage: '৫ মিনিটের মধ্যে আপনার অ্যাকাউন্টে টাকা যোগ হয়ে যাবে। যদি টাকা না যোগ হয় তাহলে এডমিন চেক করে দিবেন।' 
  });
});

app.get('/write_review', (req, res) => {
  if (!req.user) {
    return res.redirect('/login');
  }
  res.render('write_review', { user: req.user });
});

app.post('/write_review', upload.single('screenshot'), (req, res) => {
  if (!req.user) {
    return res.redirect('/login');
  }
  
  const { returnNumber, message } = req.body;
  const screenshot = req.file ? req.file.filename : null;
  
  // রিভিউ রেকর্ড সেভ করা
  const review = {
    id: reviews.length + 1,
    userId: req.user.id,
    returnNumber,
    message,
    screenshot,
    submittedAt: new Date(),
    status: 'pending'
  };
  
  reviews.push(review);
  
  res.render('write_review', { 
    user: req.user, 
    message: '৩০ মিনিটের মধ্যে আপনার টাকা ফেরত পেয়ে যাবেন' 
  });
});

// এডমিন রুটস
app.get('/admin_login', (req, res) => {
  res.render('admin_login', { message: null });
});

app.post('/admin_login', async (req, res) => {
  const { email, password } = req.body;
  
  console.log('==== ADMIN LOGIN DEBUG ====');
  console.log('Login attempt for email:', email);
  console.log('Admin users in memory:', adminUsers.length);
  console.log('Expected admin email: admin1994@admin.com');
  console.log('Environment:', process.env.NODE_ENV);
  
  // Force re-initialize admin if not found (for production issues)
  if (adminUsers.length === 0) {
    console.log('CRITICAL: Admin users array is empty! Re-initializing...');
    try {
      const adminHashedPassword = await bcrypt.hash('891994', 10);
      adminUsers = [
        { 
          id: 1, 
          email: 'admin1994@admin.com', 
          password: adminHashedPassword, 
          name: 'Admin' 
        }
      ];
      console.log('Emergency admin re-initialization successful');
    } catch (error) {
      console.error('Emergency admin re-initialization failed:', error);
    }
  }
  
  const admin = adminUsers.find(u => u.email === email);
  if (!admin) {
    console.log('Admin not found for email:', email);
    console.log('Available admin emails:', adminUsers.map(a => a.email));
    return res.render('admin_login', { message: 'ভুল ইমেইল বা পাসওয়ার্ড' });
  }
  
  const isMatch = await bcrypt.compare(password, admin.password);
  console.log('Password match result:', isMatch);
  
  if (!isMatch) {
    console.log('Password mismatch for admin:', email);
    return res.render('admin_login', { message: 'ভুল ইমেইল বা পাসওয়ার্ড' });
  }
  
  req.session.admin = admin;
  console.log('Admin login successful, redirecting to panel');
  console.log('==== END ADMIN LOGIN DEBUG ====');
  res.redirect('/admin_panel');
});

app.get('/admin_panel', (req, res) => {
  console.log('Admin panel access attempt');
  console.log('Admin session:', !!req.session.admin);
  console.log('Session ID:', req.sessionID);
  console.log('Full session:', req.session);
  
  if (!req.session.admin) {
    console.log('Admin not authenticated, redirecting to admin_login');
    return res.redirect('/admin_login');
  }
  
  console.log('Admin authenticated, rendering admin panel');
  res.render('admin_panel', { 
    users, 
    payments, 
    reviews,
    messages,
    admin: req.session.admin
  });
});

// এডমিন ইউজার ইনফরমেশন পেজ
app.get('/admin/user_information', (req, res) => {
  if (!req.session.admin) {
    return res.redirect('/admin_login');
  }
  
  res.render('user_information', { 
    users,
    admin: req.session.admin
  });
});

// ইউজার ডিলিট করার রুট
app.post('/admin/delete_user/:id', (req, res) => {
  if (!req.session.admin) {
    return res.redirect('/admin_login');
  }
  
  const userId = parseInt(req.params.id);
  
  // ইউজার খুঁজে বের করা
  const userIndex = users.findIndex(u => u.id === userId);
  
  if (userIndex !== -1) {
    // ইউজার ডিলিট করা
    users.splice(userIndex, 1);
    
    // সংশ্লিষ্ট পেমেন্ট ডিলিট করা
    for (let i = payments.length - 1; i >= 0; i--) {
      if (payments[i].userId === userId) {
        payments.splice(i, 1);
      }
    }
    
    // সংশ্লিষ্ট রিভিউ ডিলিট করা
    for (let i = reviews.length - 1; i >= 0; i--) {
      if (reviews[i].userId === userId) {
        reviews.splice(i, 1);
      }
    }
    
    // সংশ্লিষ্ট মেসেজ ডিলিট করা
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].senderId === userId || messages[i].receiverId === userId) {
        messages.splice(i, 1);
      }
    }
  }
  
  res.redirect('/admin/user_information');
});

// পেমেন্ট অনুমোদন করার রুট
app.post('/admin/approve_payment/:id', (req, res) => {
  if (!req.session.admin) {
    return res.redirect('/admin_login');
  }
  
  const paymentId = parseInt(req.params.id);
  const payment = payments.find(p => p.id === paymentId);
  
  if (payment && payment.status === 'pending') {
    // পেমেন্ট অনুমোদন করা
    payment.status = 'approved';
    payment.approvedAt = new Date();
    payment.approvedBy = req.session.admin.id;
    
    // ইউজারের ব্যালেন্স আপডেট করা
    const userIndex = users.findIndex(u => u.id === payment.userId);
    if (userIndex !== -1) {
      users[userIndex].balance += payment.amount;
    }
  }
  
  res.redirect('/admin_panel');
});

// পেমেন্ট বাতিল করার রুট  
app.post('/admin/reject_payment/:id', (req, res) => {
  if (!req.session.admin) {
    return res.redirect('/admin_login');
  }
  
  const paymentId = parseInt(req.params.id);
  const payment = payments.find(p => p.id === paymentId);
  
  if (payment && payment.status === 'pending') {
    payment.status = 'rejected';
    payment.rejectedAt = new Date();
    payment.rejectedBy = req.session.admin.id;
  }
  
  res.redirect('/admin_panel');
});

app.get('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      return next(err);
    }
    res.redirect('/login');
  });
});

app.get('/admin_logout', (req, res) => {
  req.session.admin = null;
  res.redirect('/admin_login');
});

// মেসেজিং রুট
app.get('/messages', (req, res) => {
  if (!req.user) {
    return res.redirect('/login');
  }
  res.render('messages', { user: req.user, messages: [] });
});

app.post('/search_user', (req, res) => {
  if (!req.user) {
    return res.redirect('/login');
  }
  
  const { searchUserId } = req.body;
  const foundUser = users.find(u => u.userId === searchUserId && u.id !== req.user.id);
  
  if (foundUser) {
    res.render('messages', { 
      user: req.user, 
      foundUser,
      messages: messages.filter(m => 
        (m.senderId === req.user.id && m.receiverId === foundUser.id) || 
        (m.senderId === foundUser.id && m.receiverId === req.user.id)
      ).sort((a, b) => new Date(a.sentAt) - new Date(b.sentAt))
    });
  } else {
    res.render('messages', { 
      user: req.user, 
      error: 'এই ইউজার আইডি দিয়ে কোনো ইউজার পাওয়া যায়নি!',
      messages: []
    });
  }
});

app.post('/send_message', (req, res) => {
  if (!req.user) {
    return res.redirect('/login');
  }
  
  const { receiverId, messageText } = req.body;
  const receiver = users.find(u => u.id === parseInt(receiverId));
  
  if (receiver && messageText.trim()) {
    const newMessage = {
      id: messages.length + 1,
      senderId: req.user.id,
      receiverId: parseInt(receiverId),
      messageText: messageText.trim(),
      sentAt: new Date()
    };
    
    messages.push(newMessage);
  }
  
  res.redirect('/search_user_redirect/' + receiver.userId);
});

app.get('/search_user_redirect/:userId', (req, res) => {
  if (!req.user) {
    return res.redirect('/login');
  }
  
  const foundUser = users.find(u => u.userId === req.params.userId);
  
  if (foundUser) {
    res.render('messages', { 
      user: req.user, 
      foundUser,
      messages: messages.filter(m => 
        (m.senderId === req.user.id && m.receiverId === foundUser.id) || 
        (m.senderId === foundUser.id && m.receiverId === req.user.id)
      ).sort((a, b) => new Date(a.sentAt) - new Date(b.sentAt))
    });
  } else {
    res.redirect('/messages');
  }
});

// Start server after admin initialization
const startServer = async () => {
  console.log('=== SERVER INITIALIZATION STARTING ===');
  
  try {
    await initializeAdmin();
    
    // Double-check admin initialization 
    if (adminUsers.length === 0) {
      console.error('CRITICAL ERROR: Admin users not initialized!');
      throw new Error('Admin initialization failed');
    }
    
    console.log('Admin initialization verified successfully');
    console.log('=== SERVER INITIALIZATION COMPLETE ===');
    
  } catch (error) {
    console.error('Server initialization error:', error);
    console.log('Attempting emergency initialization...');
    
    // Emergency fallback initialization
    try {
      const adminHashedPassword = await bcrypt.hash('891994', 10);
      adminUsers = [
        { 
          id: 1, 
          email: 'admin1994@admin.com', 
          password: adminHashedPassword, 
          name: 'Admin' 
        }
      ];
      console.log('Emergency admin initialization successful');
    } catch (emergencyError) {
      console.error('Emergency initialization also failed:', emergencyError);
    }
  }
  
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`সার্ভার চলছে http://localhost:${PORT} এ`);
    console.log('Environment:', process.env.NODE_ENV || 'development');
    console.log('Trust proxy:', process.env.NODE_ENV === 'production' ? 'enabled' : 'disabled');
    console.log('Cookie secure:', process.env.NODE_ENV === 'production' ? 'true' : 'false');
    console.log('=== FINAL ADMIN CREDENTIALS ===');
    console.log('Admin Email: admin1994@admin.com');
    console.log('Admin Password: 891994');
    console.log('Admin Users Count:', adminUsers.length);
    console.log('================================');
  });
};

startServer();