/**
 * PawMateHub LMS — course seed.
 *
 * Idempotent: re-runs upsert Course rows by id, upsert lessons by
 * (courseId, order), and replace each quiz lesson's QuizQuestion bank
 * (deleteMany + createMany) so editing a question's wording or correct
 * answer in this file is the canonical edit path.
 *
 * Run:  npm run seed:courses
 * Env:  DATABASE_URL must be reachable (the same one the app uses).
 */
import { PrismaClient, CourseId, LessonType } from '@prisma/client';

const prisma = new PrismaClient();

// ─────────────────────────────────────────────────────────────────────────────
// Question option helper. JSONB shape stored on QuizQuestion.options is:
//   [{ id: 'a', textEn: '...', textAr: '...' }, ...]
// We keep it as a tagged array (not a map) so option order is preserved
// across DB read/write — important for accessibility (screen readers
// announce in array order).
// ─────────────────────────────────────────────────────────────────────────────
type Option = { id: string; textEn: string; textAr: string };
type Question = {
  order: number;
  questionEn: string;
  questionAr: string;
  options: Option[];
  correctId: string;
  explanationEn: string;
  explanationAr: string;
};
type Lesson = {
  order: number;
  type: LessonType;
  titleEn: string;
  titleAr: string;
  youtubeUrl?: string;
  durationMinutes?: number;
  contentEn?: string;
  contentAr?: string;
  questions?: Question[];
};
type CourseSeed = {
  id: CourseId;
  titleEn: string;
  titleAr: string;
  descriptionEn: string;
  descriptionAr: string;
  estimatedMinutes: number;
  passScore: number;
  lessons: Lesson[];
};

// ═══════════════════════════════════════════════════════════════════════════
// COURSE 1 — WALKER_SAFETY_MODULE (5 lessons, 30 min, 8 questions)
// ═══════════════════════════════════════════════════════════════════════════
const WALKER_SAFETY: CourseSeed = {
  id: 'WALKER_SAFETY_MODULE',
  titleEn: 'Walker Safety Certification',
  titleAr: 'شهادة أمان سائق الكلاب',
  descriptionEn:
    'Five short lessons covering leash discipline, road safety, handling reactive dogs, and Egypt-specific heat protocol. Pass an 8-question quiz with at least 7 correct to certify.',
  descriptionAr:
    'خمسة دروس قصيرة تغطي ضبط القياد، السلامة على الطريق، التعامل مع الكلاب المتوترة، وبروتوكول الحر الخاص بمصر. اجتياز اختبار من 8 أسئلة بإجابة 7 صحيحة على الأقل للحصول على الشهادة.',
  estimatedMinutes: 30,
  passScore: 80,
  lessons: [
    {
      order: 1,
      type: 'TEXT',
      titleEn: 'Welcome & Your Responsibilities',
      titleAr: 'مرحباً بك ومسؤولياتك',
      durationMinutes: 5,
      contentEn:
        "Welcome to the Walker Safety Course. As a PawMateHub walker, you are the dog's full-time guardian for the duration of every walk. Your job is more than exercise — you're responsible for the dog's physical safety, emotional comfort, and behaviour in public.\n\n" +
        'Three non-negotiables:\n' +
        '1. The dog stays on a leash at all times in any public space. No exceptions for "well-trained" dogs.\n' +
        '2. You never leave the dog unattended — not tied outside a shop, not in a parked car, not at a friend\'s house.\n' +
        "3. You report incidents immediately. A scratch, a near-miss with a car, an off-leash encounter — owners hear about it from you within 15 minutes, not from the dog when they get home.\n\n" +
        'Trust on this platform is built one walk at a time. A single skipped report can end your account.',
      contentAr:
        'مرحباً بك في دورة أمان سائق الكلاب. بوصفك سائق على PawMateHub، أنت الوصي الكامل على الكلب طوال مدة كل نزهة. عملك ليس مجرد تمرين — أنت مسؤول عن السلامة الجسدية للكلب وراحته العاطفية وسلوكه في الأماكن العامة.\n\n' +
        'ثلاث قواعد لا يمكن المساس بها:\n' +
        '1. يبقى الكلب على القياد طوال الوقت في أي مكان عام. لا استثناءات للكلاب "المدربة جيداً".\n' +
        '2. لا تترك الكلب وحده أبداً — لا مربوطاً خارج المحل، ولا في سيارة موقوفة، ولا في منزل صديق.\n' +
        '3. أبلغ عن الحوادث فوراً. خدش، مرور قريب من سيارة، لقاء مع كلب طليق — يسمع المالك عنها منك خلال 15 دقيقة، وليس من الكلب عندما يعود.\n\n' +
        'الثقة على هذه المنصة تبنى نزهة بنزهة. تخطي بلاغ واحد قد ينهي حسابك.',
    },
    {
      order: 2,
      type: 'VIDEO',
      titleEn: 'Leash & Road Safety',
      titleAr: 'سلامة القياد والطريق',
      youtubeUrl: 'https://www.youtube.com/watch?v=qpQhGQ4FL3g',
      durationMinutes: 6,
      contentEn:
        'Key points from the video:\n' +
        '• Standard leash: 1.2–1.8 m. No retractable leashes for unfamiliar dogs — they snap and you lose control.\n' +
        '• Always walk on the side of the dog away from traffic.\n' +
        '• At a curb: pause. Make the dog sit. Look both ways. This is a habit, not a one-off.\n' +
        '• Cross at marked crossings only. Cairo drivers do not stop for jaywalking pedestrians, let alone dogs.\n' +
        '• Keep your phone on silent and out of your hand. Texting + leash = no peripheral attention.',
      contentAr:
        'النقاط الرئيسية من الفيديو:\n' +
        '• القياد القياسي: 1.2–1.8 متر. لا قيادات قابلة للسحب مع كلاب جديدة — تنقطع وتفقد السيطرة.\n' +
        '• امشِ دائماً على جانب الكلب البعيد عن حركة المرور.\n' +
        '• عند رصيف الشارع: توقف. اجعل الكلب يجلس. انظر للجانبين. هذه عادة، وليست لمرة واحدة.\n' +
        '• اعبر فقط عند الممرات المخصصة. سائقي القاهرة لا يتوقفون للمشاة المخالفين، فما بالك بالكلاب.\n' +
        '• احتفظ بهاتفك صامتاً وخارج يدك. الكتابة + القياد = لا انتباه محيطي.',
    },
    {
      order: 3,
      type: 'VIDEO',
      titleEn: 'Handling Aggression & Reactive Dogs',
      titleAr: 'التعامل مع العدوانية والكلاب المتوترة',
      youtubeUrl: 'https://www.youtube.com/watch?v=75BL2QdFiK8',
      durationMinutes: 7,
      contentEn:
        'When you encounter an off-leash or aggressive dog:\n' +
        '• Don\'t run. Running triggers chase instinct in most dogs.\n' +
        '• Block: stand sideways between your dog and the threat, leash held short, calm voice.\n' +
        "• If the other dog charges: an opened umbrella or jacket between you and them works as a visual barrier.\n" +
        '• Never reach in to break up a fight with bare hands — use the back-leg-lift or a jacket as separation.\n' +
        "• If your dog gets nipped: photograph the wound, log the time, message the owner immediately, head to the nearest vet for a quick check.",
      contentAr:
        'عند مواجهة كلب طليق أو عدواني:\n' +
        '• لا تركض. الجري يحفز غريزة المطاردة لدى معظم الكلاب.\n' +
        '• اعترض الطريق: قف جانبياً بين كلبك والتهديد، القياد قصير، الصوت هادئ.\n' +
        '• إذا هاجم الكلب الآخر: مظلة مفتوحة أو سترة بينكما تعمل كحاجز بصري.\n' +
        '• لا تمد يدك أبداً لتفريق شجار بيديك العاريتين — استخدم رفع الساقين الخلفيتين أو سترة للفصل.\n' +
        '• إذا تم عض كلبك: صور الجرح، سجل الوقت، راسل المالك فوراً، توجه لأقرب طبيب بيطري لفحص سريع.',
    },
    {
      order: 4,
      type: 'VIDEO',
      titleEn: 'Heat & the Egyptian Summer',
      titleAr: 'الحر وصيف مصر',
      youtubeUrl: 'https://www.youtube.com/watch?v=uhJ1Rcw6BP4',
      durationMinutes: 6,
      contentEn:
        'Egypt-specific heat rules. These are non-negotiable:\n' +
        '• If air temperature exceeds 32°C, walks are 15 minutes max, in shade, on grass or paved pavement that has been in shade.\n' +
        '• If temperature exceeds 35°C, postpone or cancel. Owner gets a credit, not a missed walk.\n' +
        '• Asphalt test: place the back of your hand on the pavement for 7 seconds. If you can\'t hold it, it will burn paws.\n' +
        '• Always carry water and a collapsible bowl. Offer at start, midpoint, and end.\n' +
        '• Heatstroke signs: heavy panting, drooling, wobbly gait, bright-red gums. Stop immediately, get to shade, wet the dog with cool (not ice) water on belly + paws, call the owner, head to vet.',
      contentAr:
        'قواعد الحر الخاصة بمصر. هذه لا تخضع للنقاش:\n' +
        '• إذا تجاوزت درجة حرارة الهواء 32 درجة مئوية، النزهات 15 دقيقة كحد أقصى، في الظل، على عشب أو رصيف كان في الظل.\n' +
        '• إذا تجاوزت 35 درجة مئوية، أجل أو ألغِ. يحصل المالك على رصيد، لا نزهة فائتة.\n' +
        '• اختبار الإسفلت: ضع ظهر يدك على الرصيف لمدة 7 ثوانٍ. إذا لم تتحمل، سيحرق الأقدام.\n' +
        '• احمل دائماً ماءً ووعاءً قابلاً للطي. قدم في البداية والمنتصف والنهاية.\n' +
        '• علامات ضربة الشمس: لهاث شديد، سيلان لعاب، مشية مترنحة، لثة حمراء فاقعة. توقف فوراً، اذهب للظل، رطب الكلب بماء بارد (وليس ثلج) على البطن والأقدام، اتصل بالمالك، توجه للطبيب البيطري.',
    },
    {
      order: 5,
      type: 'QUIZ',
      titleEn: 'Walker Safety Quiz',
      titleAr: 'اختبار أمان سائق الكلاب',
      durationMinutes: 6,
      questions: [
        {
          order: 1,
          questionEn: 'What is the maximum recommended leash length for a walk on PawMateHub?',
          questionAr: 'ما هو الحد الأقصى الموصى به لطول القياد في نزهة على PawMateHub؟',
          options: [
            { id: 'a', textEn: 'Any length — owner preference',           textAr: 'أي طول — حسب رغبة المالك' },
            { id: 'b', textEn: '1.2 to 1.8 metres, fixed (not retractable)', textAr: '1.2 إلى 1.8 متر، ثابت (غير قابل للسحب)' },
            { id: 'c', textEn: 'Retractable to 5 metres for big dogs',     textAr: 'قابل للسحب حتى 5 متر للكلاب الكبيرة' },
            { id: 'd', textEn: '3 metres minimum, no maximum',             textAr: '3 متر كحد أدنى، لا حد أقصى' },
          ],
          correctId: 'b',
          explanationEn:
            'Fixed 1.2–1.8 m leashes give immediate control. Retractables snap and you lose the dog in a critical moment.',
          explanationAr:
            'القيادات الثابتة بطول 1.2–1.8 متر تعطي سيطرة فورية. القابلة للسحب تنقطع وتفقد الكلب في لحظة حرجة.',
        },
        {
          order: 2,
          questionEn: 'When may a dog be off-leash during a walk?',
          questionAr: 'متى يجوز إطلاق الكلب من القياد أثناء النزهة؟',
          options: [
            { id: 'a', textEn: 'In a quiet park if the owner says it is fine', textAr: 'في حديقة هادئة إذا قال المالك إنه مقبول' },
            { id: 'b', textEn: 'If the dog is small and friendly',              textAr: 'إذا كان الكلب صغيراً وودوداً' },
            { id: 'c', textEn: 'Never. The dog stays on a leash in every public space.', textAr: 'أبداً. يبقى الكلب على القياد في كل مكان عام.' },
            { id: 'd', textEn: 'After 30 minutes of leash walking',              textAr: 'بعد 30 دقيقة من المشي على القياد' },
          ],
          correctId: 'c',
          explanationEn:
            'Off-leash is non-negotiable on PawMateHub. The platform liability assumes you have control of the dog at all times.',
          explanationAr: 'إطلاق الكلب لا يخضع للنقاش على PawMateHub. تفترض مسؤولية المنصة أنك تسيطر على الكلب طوال الوقت.',
        },
        {
          order: 3,
          questionEn: 'You hit a curb. What is the correct sequence before crossing?',
          questionAr: 'وصلت إلى رصيف الشارع. ما هو التسلسل الصحيح قبل العبور؟',
          options: [
            { id: 'a', textEn: 'Cross quickly — Cairo traffic doesn’t wait',  textAr: 'اعبر بسرعة — حركة القاهرة لا تنتظر' },
            { id: 'b', textEn: 'Pause, sit the dog, look both ways, then cross at a marked crossing', textAr: 'توقف، أجلس الكلب، انظر للجانبين، ثم اعبر عند ممر مشاة' },
            { id: 'c', textEn: 'Pull the leash short and weave through cars',  textAr: 'اشد القياد قصيراً وامرَّ بين السيارات' },
            { id: 'd', textEn: 'Wait for the dog to stop and decide',           textAr: 'انتظر حتى يتوقف الكلب ويقرر' },
          ],
          correctId: 'b',
          explanationEn: 'Pause + sit + scan + marked crossing. This becomes a habit and reduces incidents to near zero.',
          explanationAr: 'توقف + جلوس + مسح + ممر مشاة. تصبح هذه عادة وتقلل الحوادث إلى الصفر تقريباً.',
        },
        {
          order: 4,
          questionEn: 'An off-leash dog charges towards you. What is your first move?',
          questionAr: 'كلب طليق يهجم باتجاهك. ما هو تصرفك الأول؟',
          options: [
            { id: 'a', textEn: 'Run with your dog as fast as you can',           textAr: 'اركض مع كلبك بأسرع ما يمكن' },
            { id: 'b', textEn: 'Drop your leash and back away',                  textAr: 'اترك القياد وتراجع' },
            { id: 'c', textEn: 'Stand sideways between your dog and the threat, leash short, calm voice', textAr: 'قف جانبياً بين كلبك والتهديد، القياد قصير، الصوت هادئ' },
            { id: 'd', textEn: 'Pick up your dog and reach down to push the other dog away', textAr: 'احمل كلبك وامد يدك لدفع الكلب الآخر' },
          ],
          correctId: 'c',
          explanationEn:
            'Running triggers chase. Dropping the leash loses both dogs. Reaching in invites a redirected bite. Block sideways and de-escalate.',
          explanationAr:
            'الجري يحفز المطاردة. ترك القياد يفقد كلا الكلبين. مد اليد يدعو لعضة موجهة. اعترض جانبياً وقلل التصعيد.',
        },
        {
          order: 5,
          questionEn: 'The temperature is 35°C. What do you do?',
          questionAr: 'درجة الحرارة 35 مئوية. ماذا تفعل؟',
          options: [
            { id: 'a', textEn: 'Walk normally — dogs adapt to Egyptian heat', textAr: 'امشِ بشكل طبيعي — الكلاب تتأقلم مع حر مصر' },
            { id: 'b', textEn: 'Cut the walk to 10 minutes',                   textAr: 'قلل النزهة إلى 10 دقائق' },
            { id: 'c', textEn: 'Postpone or cancel; the owner gets a credit',  textAr: 'أجل أو ألغِ؛ يحصل المالك على رصيد' },
            { id: 'd', textEn: 'Walk only on grass and offer water once',     textAr: 'امشِ فقط على عشب وقدم ماءً مرة' },
          ],
          correctId: 'c',
          explanationEn:
            'Above 35°C the answer is always postpone. Even short walks risk paw burns and heatstroke; the credit-instead-of-walk policy protects the dog.',
          explanationAr:
            'فوق 35 مئوية الإجابة دائماً تأجيل. حتى النزهات القصيرة تخاطر بحرق الأقدام وضربة الشمس؛ سياسة الرصيد بدلاً من النزهة تحمي الكلب.',
        },
        {
          order: 6,
          questionEn: 'Which of these is a sign of heatstroke that requires you to stop the walk immediately?',
          questionAr: 'أي مما يلي علامة على ضربة الشمس تستوجب إيقاف النزهة فوراً؟',
          options: [
            { id: 'a', textEn: 'Sniffing every tree',                         textAr: 'استنشاق كل شجرة' },
            { id: 'b', textEn: 'Pulling on the leash',                         textAr: 'الشد على القياد' },
            { id: 'c', textEn: 'Heavy panting + bright-red gums + wobbly gait', textAr: 'لهاث شديد + لثة حمراء فاقعة + مشية مترنحة' },
            { id: 'd', textEn: 'Drinking water enthusiastically',              textAr: 'شرب الماء بحماس' },
          ],
          correctId: 'c',
          explanationEn:
            'Heavy panting + red gums + ataxia = heatstroke triad. Get to shade, wet belly + paws with cool water, call the owner, head to vet.',
          explanationAr:
            'لهاث شديد + لثة حمراء + ترنح = ثلاثي ضربة الشمس. اذهب للظل، رطب البطن والأقدام بماء بارد، اتصل بالمالك، توجه للطبيب البيطري.',
        },
        {
          order: 7,
          questionEn: 'Your dog has a small scrape from a fall. When should you tell the owner?',
          questionAr: 'كلبك أصيب بخدش صغير من سقطة. متى تخبر المالك؟',
          options: [
            { id: 'a', textEn: 'When you drop the dog off — saves them worrying mid-day', textAr: 'عند إعادة الكلب — يجنبهم القلق في منتصف اليوم' },
            { id: 'b', textEn: 'Within 15 minutes, with a photo and the time of the incident', textAr: 'خلال 15 دقيقة، مع صورة ووقت الحادث' },
            { id: 'c', textEn: 'Only if the dog seems to limp later',                   textAr: 'فقط إذا بدا الكلب يعرج لاحقاً' },
            { id: 'd', textEn: 'Never — small scrapes don’t matter',                    textAr: 'أبداً — الخدوش الصغيرة لا تهم' },
          ],
          correctId: 'b',
          explanationEn:
            'Always within 15 minutes with photo + timestamp. Owners hear about incidents from you, never from the dog.',
          explanationAr:
            'دائماً خلال 15 دقيقة مع صورة وتوقيت. يسمع المالكون عن الحوادث منك، وليس من الكلب أبداً.',
        },
        {
          order: 8,
          questionEn:
            'You finish a walk and the owner is not home. What do you do with the dog?',
          questionAr: 'انتهت النزهة والمالك ليس في البيت. ماذا تفعل بالكلب؟',
          options: [
            { id: 'a', textEn: 'Tie the dog outside the building',                  textAr: 'اربط الكلب خارج المبنى' },
            { id: 'b', textEn: 'Leave it in the building lobby',                    textAr: 'اتركه في صالة المبنى' },
            { id: 'c', textEn: 'Stay with the dog (or extend the booking) until the owner is reachable; never leave it unattended', textAr: 'ابقَ مع الكلب (أو مدد الحجز) حتى يمكن الوصول للمالك؛ لا تتركه أبداً وحده' },
            { id: 'd', textEn: 'Take the dog to your own home',                     textAr: 'خذ الكلب إلى منزلك' },
          ],
          correctId: 'c',
          explanationEn:
            'Never leave the dog unattended — that includes "for five minutes" and "in the lobby". Stay or extend; don\'t take it home unless the owner explicitly approves.',
          explanationAr:
            'لا تترك الكلب وحده أبداً — بما في ذلك "لخمس دقائق" و"في الصالة". ابقَ أو مدد؛ لا تأخذه للمنزل إلا إذا وافق المالك صراحة.',
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// COURSE 2 — DAY_CARE_PROVIDER_COURSE (10 lessons, 90 min, 20 questions)
// ═══════════════════════════════════════════════════════════════════════════
const DAY_CARE: CourseSeed = {
  id: 'DAY_CARE_PROVIDER_COURSE',
  titleEn: 'Day Care Provider Certification',
  titleAr: 'شهادة مزود الرعاية النهارية',
  descriptionEn:
    'Ten lessons covering body language, group management, feeding + medication, illness signs, incident documentation, and pickup procedures. Pass a 20-question quiz with 80% to certify.',
  descriptionAr:
    'عشرة دروس تغطي لغة الجسد، إدارة المجموعات، التغذية والدواء، علامات المرض، توثيق الحوادث، وإجراءات الاستلام. اجتياز اختبار من 20 سؤالاً بنسبة 80% للحصول على الشهادة.',
  estimatedMinutes: 90,
  passScore: 80,
  lessons: [
    {
      order: 1,
      type: 'TEXT',
      titleEn: 'Welcome & Your Role',
      titleAr: 'مرحباً بك ودورك',
      durationMinutes: 8,
      contentEn:
        'A day-care host runs a structured environment in their own home for 3, 6, or 8 hours at a time. You are responsible for safety, supervision, feeding, medication, behaviour management, and a clear log delivered back to the parent.\n\n' +
        'Capacity rules:\n' +
        '• Max pets at once: as declared in your profile (typically 2–4).\n' +
        '• You must have eyes on the play area at all times — no leaving dogs unattended even briefly.\n' +
        '• Separate space available: a crate, bedroom, or partitioned area you can use to isolate a dog within seconds.',
      contentAr:
        'مزود الرعاية النهارية يدير بيئة منظمة في منزله لمدة 3 أو 6 أو 8 ساعات. أنت مسؤول عن السلامة والإشراف والتغذية والدواء وإدارة السلوك وسجل واضح يسلم للمالك.\n\n' +
        'قواعد السعة:\n' +
        '• الحد الأقصى للحيوانات في وقت واحد: كما هو معلن في ملفك (عادة 2–4).\n' +
        '• يجب أن تكون عيناك على منطقة اللعب طوال الوقت — لا تترك الكلاب وحدها حتى لفترة قصيرة.\n' +
        '• مساحة منفصلة متاحة: قفص، غرفة نوم، أو منطقة مقسمة يمكنك استخدامها لعزل كلب خلال ثوانٍ.',
    },
    {
      order: 2,
      type: 'VIDEO',
      titleEn: 'Reading Dog Body Language',
      titleAr: 'قراءة لغة جسد الكلاب',
      youtubeUrl: 'https://www.youtube.com/watch?v=o2HM4-qhpH0',
      durationMinutes: 10,
      contentEn:
        'Calm signals: loose body, relaxed mouth, soft eyes, low tail wag.\n' +
        'Stress signals: lip-licking when no food, yawn out of context, "whale eye" (white showing), scratching, body shake.\n' +
        'Escalation signals: stiff body, closed mouth, hard stare, raised hackles, low growl.\n' +
        'Action: at the first stress signal, separate the dog into a calm space for 5–10 minutes. Don\'t wait for escalation.',
      contentAr:
        'إشارات الهدوء: جسم مرتخٍ، فم مسترخٍ، عيون ناعمة، تحريك ذيل منخفض.\n' +
        'إشارات التوتر: لعق الشفاه دون طعام، تثاؤب خارج السياق، "عين الحوت" (الأبيض ظاهر)، حك، اهتزاز الجسم.\n' +
        'إشارات التصعيد: جسم متيبس، فم مغلق، نظرة حادة، شعر العنق منتفخ، هدير منخفض.\n' +
        'الإجراء: عند أول إشارة توتر، افصل الكلب في مساحة هادئة لمدة 5–10 دقائق. لا تنتظر التصعيد.',
    },
    {
      order: 3,
      type: 'VIDEO',
      titleEn: 'Group Play Management',
      titleAr: 'إدارة لعب المجموعات',
      youtubeUrl: 'https://www.youtube.com/watch?v=yTjedDxCmgg',
      durationMinutes: 12,
      contentEn:
        'Healthy play: rotation of who chases whom, both dogs taking breaks, play-bows, soft mouths.\n' +
        'Unhealthy play: one dog always chased, no breaks, hard mouths, body slams.\n' +
        'Group sizes: keep play groups to 3 or fewer. With 4+, run two rotating groups instead.\n' +
        'Trio rule: if three dogs gang up on a fourth, end play immediately and reset.',
      contentAr:
        'لعب صحي: تناوب من يطارد من، الكلاب تأخذ استراحات، انحناءات اللعب، أفواه ناعمة.\n' +
        'لعب غير صحي: كلب واحد يلاحق دائماً، لا استراحات، أفواه قاسية، اصطدامات جسدية.\n' +
        'أحجام المجموعات: حافظ على مجموعات اللعب 3 أو أقل. مع 4 أو أكثر، شغل مجموعتين متناوبتين بدلاً.\n' +
        'قاعدة الثلاثي: إذا تجمع ثلاثة كلاب على رابع، أنهِ اللعب فوراً وأعد الضبط.',
    },
    {
      order: 4,
      type: 'VIDEO',
      titleEn: 'Feeding & Medication Schedules',
      titleAr: 'جداول التغذية والدواء',
      youtubeUrl: 'https://www.youtube.com/watch?v=MWv7C13cMr4',
      durationMinutes: 10,
      contentEn:
        'Always read the parent\'s feeding + medication notes before pickup.\n' +
        '• Feed each dog in a separate space — no shared bowls, ever.\n' +
        '• Medication: confirm dose, time, and method (oral vs topical). Sign + photograph after administering.\n' +
        '• Treats: only what the owner approves. Many dogs have allergies that don\'t show in the breed but show in the booking notes.\n' +
        '• Water bowls in every room the dogs use.',
      contentAr:
        'دائماً اقرأ ملاحظات التغذية والدواء من المالك قبل الاستلام.\n' +
        '• أطعم كل كلب في مكان منفصل — لا أوعية مشتركة أبداً.\n' +
        '• الدواء: تأكد من الجرعة والوقت والطريقة (فموي أم موضعي). وقع وصور بعد الإعطاء.\n' +
        '• الحلوى: فقط ما يوافق عليه المالك. كثير من الكلاب لديها حساسيات لا تظهر في السلالة بل في ملاحظات الحجز.\n' +
        '• أوعية ماء في كل غرفة يستخدمها الكلاب.',
    },
    {
      order: 5,
      type: 'VIDEO',
      titleEn: 'Behaviour Signals — Deeper Dive',
      titleAr: 'إشارات السلوك — تعمق أكثر',
      youtubeUrl: 'https://www.youtube.com/watch?v=o2HM4-qhpH0',
      durationMinutes: 8,
      contentEn:
        'Resource guarding: a dog stiffening over food, toy, or sleeping spot. Action: remove the trigger, separate the dog. Never reach in.\n' +
        'Reactivity at a window or door: redirect with a positive cue + treat, move dog away from the trigger.\n' +
        'Over-arousal: a dog that can\'t settle, panting hard. Crate or quiet room for 15 minutes — most reset on their own.',
      contentAr:
        'حماية الموارد: كلب يتيبس فوق طعام أو لعبة أو مكان نوم. الإجراء: أزل المحفز، افصل الكلب. لا تمد يدك أبداً.\n' +
        'التفاعل عند نافذة أو باب: حول الانتباه بإشارة إيجابية + حلوى، أبعد الكلب عن المحفز.\n' +
        'الإثارة الزائدة: كلب لا يستطيع الهدوء، يلهث بقوة. قفص أو غرفة هادئة لمدة 15 دقيقة — معظمها يستعيد توازنه.',
    },
    {
      order: 6,
      type: 'VIDEO',
      titleEn: 'Health & Biosecurity',
      titleAr: 'الصحة والأمان الحيوي',
      youtubeUrl: 'https://www.youtube.com/watch?v=Q_fMbLlNu8Q',
      durationMinutes: 10,
      contentEn:
        'Vaccination check: parent uploads passport in app. Confirm rabies, DHPP, and parvo are current. If anything is missing, message support before accepting.\n' +
        'Illness signs to watch for: lethargy, vomiting, diarrhoea, repeated coughing, no appetite, eye/nose discharge.\n' +
        'Sanitation: clean the play area between groups. Separate water bowls per group rotation. Wash hands between handling different dogs.',
      contentAr:
        'فحص التطعيمات: المالك يرفع جواز التطعيم في التطبيق. تأكد من أن السعار وDHPP وبارفو سارية. إذا كان أي شيء ناقصاً، راسل الدعم قبل القبول.\n' +
        'علامات المرض التي يجب الانتباه لها: خمول، قيء، إسهال، سعال متكرر، فقدان شهية، إفرازات من العين/الأنف.\n' +
        'التعقيم: نظف منطقة اللعب بين المجموعات. أوعية ماء منفصلة لكل دوران مجموعة. اغسل يديك بين التعامل مع الكلاب المختلفة.',
    },
    {
      order: 7,
      type: 'TEXT',
      titleEn: 'Incident Documentation',
      titleAr: 'توثيق الحوادث',
      durationMinutes: 8,
      contentEn:
        'Every incident — bite, scrape, vomit, accident — is logged in the app within 15 minutes. Format:\n' +
        '1. Time (24h)\n' +
        '2. Pet involved\n' +
        '3. What happened (one sentence)\n' +
        '4. What you did\n' +
        '5. Photo if visible\n' +
        '6. Whether the parent was contacted\n\n' +
        'Why this matters: incident logs are how PawMateHub investigates disputes. A complete log protects you. A skipped log shifts liability to you.',
      contentAr:
        'كل حادث — عضة أو خدش أو قيء أو حادثة — يسجل في التطبيق خلال 15 دقيقة. الصيغة:\n' +
        '1. الوقت (24 ساعة)\n' +
        '2. الحيوان المعني\n' +
        '3. ما حدث (جملة واحدة)\n' +
        '4. ما فعلته\n' +
        '5. صورة إن أمكن\n' +
        '6. هل تم الاتصال بالمالك\n\n' +
        'لماذا هذا مهم: سجلات الحوادث هي طريقة PawMateHub في التحقيق في النزاعات. سجل كامل يحميك. سجل مفقود ينقل المسؤولية إليك.',
    },
    {
      order: 8,
      type: 'TEXT',
      titleEn: 'Owner Communication',
      titleAr: 'التواصل مع المالك',
      durationMinutes: 6,
      contentEn:
        'Cadence:\n' +
        '• At pickup: confirm receipt with a photo of the dog in your space.\n' +
        '• Midpoint: one short update (photo or 5-second video) per 4 hours of care.\n' +
        '• At dropoff: a 2-line summary — meals eaten, walks taken, mood.\n\n' +
        'Tone:\n' +
        '• Specific details (\"Max ate all his lunch and napped 1.5 hours\") build trust faster than generic happy notes.\n' +
        '• Bad news first, calmly: \"Max had a small accident at 14:30, he\'s fine, photo attached.\" Owners would rather hear from you than guess.',
      contentAr:
        'الإيقاع:\n' +
        '• عند الاستلام: أكد الاستلام بصورة للكلب في مساحتك.\n' +
        '• في المنتصف: تحديث قصير واحد (صورة أو فيديو 5 ثوانٍ) كل 4 ساعات رعاية.\n' +
        '• عند التسليم: ملخص من سطرين — الوجبات المتناولة، النزهات، المزاج.\n\n' +
        'النبرة:\n' +
        '• التفاصيل المحددة ("ماكس أكل غدائه كاملاً ونام ساعة ونصف") تبني الثقة أسرع من الملاحظات العامة السعيدة.\n' +
        '• الأخبار السيئة أولاً، بهدوء: "ماكس تعرض لحادثة صغيرة الساعة 14:30، هو بخير، الصورة مرفقة." يفضل المالكون السماع منك على التخمين.',
    },
    {
      order: 9,
      type: 'TEXT',
      titleEn: 'Pickup & Dropoff Procedures',
      titleAr: 'إجراءات الاستلام والتسليم',
      durationMinutes: 6,
      contentEn:
        'On arrival of a new dog:\n' +
        '1. Check the dog\'s tag and the booking. Mismatch → call support.\n' +
        '2. Read parent notes again (medications, allergies, fears).\n' +
        '3. Slow introduction to existing dogs. Leashes on, parallel walking before off-leash play.\n' +
        '4. First 30 minutes: dog stays near you. Watch for stress signals.\n\n' +
        'At dropoff:\n' +
        '1. Use the handover code from the parent\'s booking detail screen.\n' +
        '2. Hand over personal belongings (leash, jacket, food bag).\n' +
        '3. Verbal summary + the in-app summary.',
      contentAr:
        'عند وصول كلب جديد:\n' +
        '1. افحص علامة الكلب والحجز. عدم تطابق → اتصل بالدعم.\n' +
        '2. اقرأ ملاحظات المالك مجدداً (الأدوية، الحساسيات، المخاوف).\n' +
        '3. تعريف بطيء للكلاب الموجودة. القيادات معلقة، مشي متوازٍ قبل اللعب الحر.\n' +
        '4. أول 30 دقيقة: الكلب يبقى قربك. راقب إشارات التوتر.\n\n' +
        'عند التسليم:\n' +
        '1. استخدم رمز التسليم من شاشة تفاصيل حجز المالك.\n' +
        '2. سلم المتعلقات الشخصية (القياد، السترة، حقيبة الطعام).\n' +
        '3. ملخص شفهي + الملخص داخل التطبيق.',
    },
    {
      order: 10,
      type: 'QUIZ',
      titleEn: 'Day Care Provider Quiz',
      titleAr: 'اختبار مزود الرعاية النهارية',
      durationMinutes: 12,
      questions: dayCareQuestions(),
    },
  ],
};

function dayCareQuestions(): Question[] {
  // 20 questions covering body language, group play, feeding, illness, comms,
  // pickup, and biosecurity. Correct id is the option that matches the
  // policy in the lesson copy above.
  return [
    {
      order: 1,
      questionEn: 'A dog yawns repeatedly when no one is sleepy. What does this most likely indicate?',
      questionAr: 'كلب يتثاءب باستمرار دون أن يكون أحد نعساناً. ما الذي يشير إليه هذا غالباً؟',
      options: [
        { id: 'a', textEn: 'Boredom — start a game', textAr: 'ملل — ابدأ لعبة' },
        { id: 'b', textEn: 'A stress signal',          textAr: 'إشارة توتر' },
        { id: 'c', textEn: 'Hunger',                   textAr: 'جوع' },
        { id: 'd', textEn: 'A trick the dog learned',  textAr: 'حيلة تعلمها الكلب' },
      ],
      correctId: 'b',
      explanationEn: 'Yawning out of context is a classic calming/stress signal in dogs.',
      explanationAr: 'التثاؤب خارج السياق إشارة هدوء/توتر كلاسيكية في الكلاب.',
    },
    {
      order: 2,
      questionEn: 'You see "whale eye" — the white of the eye showing. What should you do?',
      questionAr: 'ترى "عين الحوت" — أبيض العين ظاهر. ماذا تفعل؟',
      options: [
        { id: 'a', textEn: 'Call the dog over and pet it',    textAr: 'ادعُ الكلب وداعبه' },
        { id: 'b', textEn: 'Identify and remove the trigger', textAr: 'حدد وأزل المحفز' },
        { id: 'c', textEn: 'Take a photo for the parent',     textAr: 'خذ صورة للمالك' },
        { id: 'd', textEn: 'Wait for it to escalate',          textAr: 'انتظر حتى يتصاعد' },
      ],
      correctId: 'b',
      explanationEn: 'Whale eye = stress. Remove the trigger before escalation.',
      explanationAr: 'عين الحوت = توتر. أزل المحفز قبل التصعيد.',
    },
    {
      order: 3,
      questionEn: 'Maximum dogs per active play group?',
      questionAr: 'الحد الأقصى للكلاب في مجموعة لعب نشطة؟',
      options: [
        { id: 'a', textEn: '2', textAr: '2' },
        { id: 'b', textEn: '3', textAr: '3' },
        { id: 'c', textEn: '5', textAr: '5' },
        { id: 'd', textEn: '7', textAr: '7' },
      ],
      correctId: 'b',
      explanationEn: 'Three or fewer per active play group; rotate larger numbers.',
      explanationAr: 'ثلاثة أو أقل لكل مجموعة لعب نشطة؛ ناوب الأعداد الأكبر.',
    },
    {
      order: 4,
      questionEn: 'Three dogs are ganging up on a fourth. What do you do?',
      questionAr: 'ثلاثة كلاب يتجمعون على رابع. ماذا تفعل؟',
      options: [
        { id: 'a', textEn: 'Let it resolve naturally',         textAr: 'اتركه يحل طبيعياً' },
        { id: 'b', textEn: 'End play immediately and reset',   textAr: 'أنهِ اللعب فوراً وأعد الضبط' },
        { id: 'c', textEn: 'Yell at the three dogs',            textAr: 'اصرخ على الكلاب الثلاثة' },
        { id: 'd', textEn: 'Pick up the fourth dog',            textAr: 'احمل الكلب الرابع' },
      ],
      correctId: 'b',
      explanationEn: 'Trio rule: 3-on-1 escalates fast. End and reset.',
      explanationAr: 'قاعدة الثلاثي: 3 ضد 1 تتصاعد بسرعة. أنهِ وأعد الضبط.',
    },
    {
      order: 5,
      questionEn: 'When may dogs share a single water bowl?',
      questionAr: 'متى يجوز للكلاب مشاركة وعاء ماء واحد؟',
      options: [
        { id: 'a', textEn: 'Always — they all drink',                                    textAr: 'دائماً — كلهم يشربون' },
        { id: 'b', textEn: 'If they are from the same family',                            textAr: 'إذا كانوا من نفس العائلة' },
        { id: 'c', textEn: 'Never — biosecurity + resource-guarding risk',                textAr: 'أبداً — أمان حيوي وخطر حماية الموارد' },
        { id: 'd', textEn: 'After they are introduced',                                   textAr: 'بعد التعارف' },
      ],
      correctId: 'c',
      explanationEn: 'Separate water and food bowls per dog — biosecurity + resource-guarding.',
      explanationAr: 'أوعية ماء وطعام منفصلة لكل كلب — أمان حيوي وحماية موارد.',
    },
    {
      order: 6,
      questionEn: 'A dog needs medication at 13:00. What do you do after administering?',
      questionAr: 'كلب يحتاج دواء الساعة 13:00. ماذا تفعل بعد الإعطاء؟',
      options: [
        { id: 'a', textEn: 'Nothing — just continue care',           textAr: 'لا شيء — تابع الرعاية' },
        { id: 'b', textEn: 'Sign + photograph in the in-app log',     textAr: 'وقع وصور في السجل داخل التطبيق' },
        { id: 'c', textEn: 'Tell the parent at dropoff',              textAr: 'أخبر المالك عند التسليم' },
        { id: 'd', textEn: 'Wait to see if it works first',           textAr: 'انتظر لترى هل يعمل أولاً' },
      ],
      correctId: 'b',
      explanationEn: 'Sign + photograph after administering. Audit trail protects you and the dog.',
      explanationAr: 'وقع وصور بعد الإعطاء. سجل المراجعة يحميك ويحمي الكلب.',
    },
    {
      order: 7,
      questionEn: 'Which is NOT a sign of illness to watch for?',
      questionAr: 'أي مما يلي ليس علامة مرض يجب الانتباه لها؟',
      options: [
        { id: 'a', textEn: 'Lethargy',           textAr: 'خمول' },
        { id: 'b', textEn: 'Repeated coughing',  textAr: 'سعال متكرر' },
        { id: 'c', textEn: 'A play-bow',          textAr: 'انحناءة لعب' },
        { id: 'd', textEn: 'Eye/nose discharge', textAr: 'إفرازات من العين/الأنف' },
      ],
      correctId: 'c',
      explanationEn: 'Play-bows are healthy. Lethargy + cough + discharge are warning signs.',
      explanationAr: 'انحناءات اللعب صحية. الخمول والسعال والإفرازات علامات تحذير.',
    },
    {
      order: 8,
      questionEn: 'A dog stiffens over a chew toy when another approaches. What do you do?',
      questionAr: 'كلب يتيبس فوق لعبة مضغ عند اقتراب آخر. ماذا تفعل؟',
      options: [
        { id: 'a', textEn: 'Take the toy out of his mouth',         textAr: 'أخرج اللعبة من فمه' },
        { id: 'b', textEn: 'Remove the trigger and separate the dog', textAr: 'أزل المحفز وافصل الكلب' },
        { id: 'c', textEn: 'Let them sort it out',                   textAr: 'دعهم يتدبرون' },
        { id: 'd', textEn: 'Add a second toy',                       textAr: 'أضف لعبة ثانية' },
      ],
      correctId: 'b',
      explanationEn: 'Resource guarding: remove the trigger, separate the dog. Never reach in.',
      explanationAr: 'حماية الموارد: أزل المحفز، افصل الكلب. لا تمد يدك أبداً.',
    },
    {
      order: 9,
      questionEn: 'How often should you send midpoint updates during a 6-hour day care?',
      questionAr: 'كم مرة ترسل تحديثات منتصف خلال رعاية 6 ساعات؟',
      options: [
        { id: 'a', textEn: 'Once at the start, once at the end',        textAr: 'مرة في البداية ومرة في النهاية' },
        { id: 'b', textEn: 'Every hour',                                 textAr: 'كل ساعة' },
        { id: 'c', textEn: 'Roughly one short update per 4 hours of care', textAr: 'تقريباً تحديث قصير واحد كل 4 ساعات رعاية' },
        { id: 'd', textEn: 'Only if asked',                              textAr: 'فقط عند الطلب' },
      ],
      correctId: 'c',
      explanationEn: 'A short photo or 5-second video per 4 hours is the platform cadence.',
      explanationAr: 'صورة قصيرة أو فيديو 5 ثوانٍ كل 4 ساعات هو إيقاع المنصة.',
    },
    {
      order: 10,
      questionEn: 'A dog vomits during care. When do you log it?',
      questionAr: 'كلب يتقيأ أثناء الرعاية. متى تسجل ذلك؟',
      options: [
        { id: 'a', textEn: 'At dropoff — keeps the parent calm',  textAr: 'عند التسليم — يحافظ على هدوء المالك' },
        { id: 'b', textEn: 'Within 15 minutes, in the app',        textAr: 'خلال 15 دقيقة، في التطبيق' },
        { id: 'c', textEn: 'Only if it happens twice',             textAr: 'فقط إذا حدث مرتين' },
        { id: 'd', textEn: 'After the dog naps',                   textAr: 'بعد قيلولة الكلب' },
      ],
      correctId: 'b',
      explanationEn: 'Every incident is logged within 15 minutes — bite, vomit, scrape, accident.',
      explanationAr: 'كل حادثة تسجل خلال 15 دقيقة — عضة، قيء، خدش، حادث.',
    },
    {
      order: 11,
      questionEn: 'A dog\'s vaccination passport is missing rabies proof. What is correct?',
      questionAr: 'جواز تطعيم كلب ينقصه إثبات السعار. ما الصحيح؟',
      options: [
        { id: 'a', textEn: 'Accept anyway — owner will send later',           textAr: 'اقبل على أي حال — المالك سيرسل لاحقاً' },
        { id: 'b', textEn: 'Message support before accepting the booking',     textAr: 'راسل الدعم قبل قبول الحجز' },
        { id: 'c', textEn: 'Decline silently and re-list',                     textAr: 'ارفض بصمت وأعد العرض' },
        { id: 'd', textEn: 'Ask the dog to behave',                            textAr: 'اطلب من الكلب أن يحسن السلوك' },
      ],
      correctId: 'b',
      explanationEn: 'Verify before accepting. Support routes incomplete passports.',
      explanationAr: 'تحقق قبل القبول. الدعم يوجه الجوازات غير الكاملة.',
    },
    {
      order: 12,
      questionEn: 'How long should a new dog stay near you in the first interaction?',
      questionAr: 'كم يجب أن يبقى الكلب الجديد بقربك في التفاعل الأول؟',
      options: [
        { id: 'a', textEn: '5 minutes',                  textAr: '5 دقائق' },
        { id: 'b', textEn: '30 minutes',                 textAr: '30 دقيقة' },
        { id: 'c', textEn: 'No need — let them mingle',  textAr: 'لا حاجة — دعهم يختلطون' },
        { id: 'd', textEn: '2 hours',                    textAr: 'ساعتان' },
      ],
      correctId: 'b',
      explanationEn: 'First 30 minutes: dog stays near you so you read stress signals before they cluster.',
      explanationAr: 'أول 30 دقيقة: الكلب يبقى قربك لتقرأ إشارات التوتر قبل تجمعهم.',
    },
    {
      order: 13,
      questionEn: 'What is the correct introduction sequence for a new dog meeting existing ones?',
      questionAr: 'ما هو تسلسل التعريف الصحيح لكلب جديد يلتقي بالموجودين؟',
      options: [
        { id: 'a', textEn: 'Off-leash, fastest is best',                                   textAr: 'بدون قياد، الأسرع أفضل' },
        { id: 'b', textEn: 'Leashes on, parallel walking, then off-leash play',             textAr: 'قيادات معلقة، مشي متوازٍ، ثم لعب بدون قياد' },
        { id: 'c', textEn: 'Inside the play area together immediately',                     textAr: 'داخل منطقة اللعب معاً فوراً' },
        { id: 'd', textEn: 'Through a closed door',                                          textAr: 'عبر باب مغلق' },
      ],
      correctId: 'b',
      explanationEn: 'Leashed parallel walking lets dogs read each other before unstructured play.',
      explanationAr: 'المشي المتوازي مع القياد يسمح للكلاب بقراءة بعضها قبل اللعب غير المنظم.',
    },
    {
      order: 14,
      questionEn: 'A dog refuses to eat. What is the correct first action?',
      questionAr: 'كلب يرفض الأكل. ما الإجراء الأول الصحيح؟',
      options: [
        { id: 'a', textEn: 'Force-feed by hand',                              textAr: 'أطعم بالقوة باليد' },
        { id: 'b', textEn: 'Note it, keep monitoring, message the parent',     textAr: 'سجل ذلك، استمر بالمراقبة، راسل المالك' },
        { id: 'c', textEn: 'Switch to your own food brand',                    textAr: 'استبدل بعلامة طعامك أنت' },
        { id: 'd', textEn: 'Add treats until it eats',                          textAr: 'أضف حلويات حتى يأكل' },
      ],
      correctId: 'b',
      explanationEn: 'New environment can suppress appetite for a few hours. Note + monitor + inform parent.',
      explanationAr: 'البيئة الجديدة قد تثبط الشهية لساعات. سجل + راقب + أبلغ المالك.',
    },
    {
      order: 15,
      questionEn: 'Two dogs play. One is always being chased and never gets a break. What do you do?',
      questionAr: 'كلبان يلعبان. واحد دائماً مطارَد ولا يحصل على استراحة. ماذا تفعل؟',
      options: [
        { id: 'a', textEn: 'Cheer them on — both seem energetic',         textAr: 'شجعهم — يبدو كلاهما نشيطاً' },
        { id: 'b', textEn: 'Call a break and separate them for 5–10 mins', textAr: 'أعلن استراحة وافصلهم 5–10 دقائق' },
        { id: 'c', textEn: 'Add a third dog to balance',                   textAr: 'أضف كلباً ثالثاً للتوازن' },
        { id: 'd', textEn: 'Let them tire each other out',                  textAr: 'دعهم يتعبون بعضهم' },
      ],
      correctId: 'b',
      explanationEn: 'Healthy play has rotation + breaks. Sustained one-way chase = bullying.',
      explanationAr: 'اللعب الصحي يحتوي تناوب واستراحات. مطاردة أحادية مستمرة = تنمر.',
    },
    {
      order: 16,
      questionEn: 'You drop the dog off. The parent isn\'t home. What do you do?',
      questionAr: 'تسلم الكلب. المالك ليس في البيت. ماذا تفعل؟',
      options: [
        { id: 'a', textEn: 'Tie outside the building',                                       textAr: 'اربط خارج المبنى' },
        { id: 'b', textEn: 'Stay with the dog or extend the booking until reachable',         textAr: 'ابقَ مع الكلب أو مدد الحجز حتى يمكن الوصول' },
        { id: 'c', textEn: 'Leave with the building doorman',                                  textAr: 'اتركه مع بواب المبنى' },
        { id: 'd', textEn: 'Bring it to your home indefinitely',                               textAr: 'خذه إلى منزلك إلى أجل غير مسمى' },
      ],
      correctId: 'b',
      explanationEn: 'Never leave a dog unattended. Extend until the parent is reachable.',
      explanationAr: 'لا تترك كلباً وحده. مدد حتى يمكن الوصول للمالك.',
    },
    {
      order: 17,
      questionEn: 'Which feeding rule is correct?',
      questionAr: 'أي قاعدة تغذية صحيحة؟',
      options: [
        { id: 'a', textEn: 'Feed dogs together to bond them',                          textAr: 'أطعم الكلاب معاً لتقريبها' },
        { id: 'b', textEn: 'Each dog eats in a separate space',                         textAr: 'كل كلب يأكل في مكان منفصل' },
        { id: 'c', textEn: 'Free-feed leftover food in shared bowls',                   textAr: 'تغذية حرة لبقايا الطعام في أوعية مشتركة' },
        { id: 'd', textEn: 'Skip meals if the dog seems anxious',                        textAr: 'تخطى الوجبات إذا بدا الكلب قلقاً' },
      ],
      correctId: 'b',
      explanationEn: 'Separate spaces prevent guarding fights and biosecurity risks.',
      explanationAr: 'المساحات المنفصلة تمنع شجارات الحماية ومخاطر الأمان الحيوي.',
    },
    {
      order: 18,
      questionEn: 'Which best describes communication tone with parents?',
      questionAr: 'أيهما يصف نبرة التواصل مع المالكين بشكل أفضل؟',
      options: [
        { id: 'a', textEn: 'Generic happy notes only',              textAr: 'ملاحظات سعيدة عامة فقط' },
        { id: 'b', textEn: 'Specific details + bad news first, calmly', textAr: 'تفاصيل محددة + الأخبار السيئة أولاً، بهدوء' },
        { id: 'c', textEn: 'Skip updates if all is fine',            textAr: 'تخطَّ التحديثات إذا كان كل شيء بخير' },
        { id: 'd', textEn: 'Voice notes only',                        textAr: 'ملاحظات صوتية فقط' },
      ],
      correctId: 'b',
      explanationEn: 'Specific + bad news first builds trust faster than vague-positive padding.',
      explanationAr: 'محدد + الأخبار السيئة أولاً يبني الثقة أسرع من الحشو الإيجابي الغامض.',
    },
    {
      order: 19,
      questionEn: 'What does an over-aroused dog typically need?',
      questionAr: 'ما الذي يحتاجه الكلب المثار بشكل زائد عادة؟',
      options: [
        { id: 'a', textEn: 'A long walk to wear it out',     textAr: 'نزهة طويلة لإتعابه' },
        { id: 'b', textEn: 'A crate or quiet room ~15 mins', textAr: 'قفص أو غرفة هادئة ~15 دقيقة' },
        { id: 'c', textEn: 'A new toy',                       textAr: 'لعبة جديدة' },
        { id: 'd', textEn: 'Another dog to play with',         textAr: 'كلب آخر للعب' },
      ],
      correctId: 'b',
      explanationEn: 'Over-arousal needs reset, not more stimulation. 15 minutes calm space usually does it.',
      explanationAr: 'الإثارة الزائدة تحتاج إعادة ضبط، لا مزيد تحفيز. 15 دقيقة في مساحة هادئة تكفي عادة.',
    },
    {
      order: 20,
      questionEn: 'You start the visit. What do you use to confirm pickup with the parent in-app?',
      questionAr: 'تبدأ الزيارة. ماذا تستخدم لتأكيد الاستلام مع المالك داخل التطبيق؟',
      options: [
        { id: 'a', textEn: 'A photo only',                                                   textAr: 'صورة فقط' },
        { id: 'b', textEn: 'The 6-digit handover code from the parent\'s booking screen',      textAr: 'رمز التسليم المكون من 6 أرقام من شاشة حجز المالك' },
        { id: 'c', textEn: 'A WhatsApp voice note',                                            textAr: 'ملاحظة صوتية واتساب' },
        { id: 'd', textEn: 'The dog\'s vaccination card',                                      textAr: 'بطاقة تطعيم الكلب' },
      ],
      correctId: 'b',
      explanationEn: 'Handover code is the audited mechanism (currently observe-mode; blocking later).',
      explanationAr: 'رمز التسليم هو الآلية الموثقة (وضع المراقبة حالياً؛ سيكون حاجزاً لاحقاً).',
    },
  ];
}

// ═══════════════════════════════════════════════════════════════════════════
// COURSE 3 — BOARDING_PROVIDER_COURSE (12 lessons, 180 min, 25 questions)
// ═══════════════════════════════════════════════════════════════════════════
const BOARDING: CourseSeed = {
  id: 'BOARDING_PROVIDER_COURSE',
  titleEn: 'Boarding Provider Certification',
  titleAr: 'شهادة مزود الإقامة الليلية',
  descriptionEn:
    'Twelve lessons covering the full overnight stay lifecycle: home setup, intake, daily routine, multi-pet management, overnight monitoring, behaviour + health, emergency response, and parent communication. Pass a 25-question quiz with 80% to certify. This certification also covers Day Care + Walking.',
  descriptionAr:
    'اثنا عشر درساً يغطي دورة الإقامة الكاملة: إعداد المنزل، الاستقبال، الروتين اليومي، إدارة الحيوانات المتعددة، المراقبة الليلية، السلوك والصحة، الاستجابة للطوارئ، والتواصل مع المالك. اجتياز اختبار من 25 سؤالاً بنسبة 80% للحصول على الشهادة. تغطي هذه الشهادة أيضاً الرعاية النهارية والتمشية.',
  estimatedMinutes: 180,
  passScore: 80,
  lessons: [
    {
      order: 1,
      type: 'TEXT',
      titleEn: 'Welcome & The Boarding Host Role',
      titleAr: 'مرحباً بك ودور مزود الإقامة',
      durationMinutes: 10,
      contentEn:
        'Boarding is the most demanding service on PawMateHub. The dog spends 24+ hours in your home. Sleep, meals, exercise, medication, behaviour, and emergency response all sit with you.\n\n' +
        'Three commitments you accept by being certified:\n' +
        '1. Continuous supervision: you (or a co-host you\'ve declared) are always on-property when boarding pets are present.\n' +
        '2. Predictable routine: meals, walks, sleep windows happen at consistent times — dogs settle faster on routine.\n' +
        '3. Documented care: every meal, medication, walk, mood check, and incident is in the in-app log. Parents see this in real time.',
      contentAr:
        'الإقامة الليلية أكثر الخدمات تطلباً على PawMateHub. يقضي الكلب 24+ ساعة في منزلك. النوم والوجبات والتمارين والدواء والسلوك والاستجابة للطوارئ كلها مسؤوليتك.\n\n' +
        'ثلاثة التزامات تقبلها بالاعتماد:\n' +
        '1. إشراف مستمر: أنت (أو مساعد معلن) دائماً في الموقع عند وجود حيوانات إقامة.\n' +
        '2. روتين متوقع: وجبات ونزهات ونوافذ نوم في أوقات ثابتة — الكلاب تستقر أسرع على الروتين.\n' +
        '3. رعاية موثقة: كل وجبة ودواء ونزهة وفحص مزاج وحادث في السجل داخل التطبيق. المالكون يرون ذلك مباشرة.',
    },
    {
      order: 2,
      type: 'TEXT',
      titleEn: 'Pre-arrival Setup & Home Safety',
      titleAr: 'الإعداد قبل الوصول وسلامة المنزل',
      durationMinutes: 12,
      contentEn:
        'Before the booking starts:\n' +
        '• Sweep floors for choking hazards (coins, hair ties, small toys belonging to children).\n' +
        '• Check fence + balcony — close any gap a small dog could squeeze through.\n' +
        '• Lock medicines, chocolate, grapes, xylitol gum, and household cleaners out of nose-reach.\n' +
        '• Set up the dog\'s sleeping area with their own bed/blanket from home if provided.\n' +
        '• Crate-trained dogs: place the crate in a quiet spot, door open by default.\n' +
        '• Two water bowls minimum, refilled twice daily.',
      contentAr:
        'قبل بدء الحجز:\n' +
        '• امسح الأرضيات بحثاً عن مخاطر اختناق (عملات، رباطات شعر، ألعاب أطفال صغيرة).\n' +
        '• افحص السور والشرفة — أغلق أي فجوة قد يخرج منها كلب صغير.\n' +
        '• اغلق الأدوية والشوكولاتة والعنب وعلكة الزيليتول ومنظفات المنزل بعيداً عن الأنف.\n' +
        '• جهز منطقة نوم الكلب بسريره/بطانيته من المنزل إذا قُدم.\n' +
        '• كلاب مدربة على القفص: ضع القفص في مكان هادئ، الباب مفتوح افتراضياً.\n' +
        '• وعاءا ماء كحد أدنى، يعاد ملؤهما مرتين يومياً.',
    },
    {
      order: 3,
      type: 'VIDEO',
      titleEn: 'Compatibility Assessment & Intake',
      titleAr: 'تقييم التوافق والاستقبال',
      youtubeUrl: 'https://www.youtube.com/watch?v=o2HM4-qhpH0',
      durationMinutes: 12,
      contentEn:
        'Intake checklist (do this within the first 30 minutes of arrival):\n' +
        '1. Verify the dog matches the booking (name, photo, microchip if listed).\n' +
        '2. Read parent notes again: medications, allergies, fears, behaviour history.\n' +
        '3. Ask the parent in person about anything unclear — don\'t guess.\n' +
        '4. Show the dog its sleeping spot and water.\n' +
        '5. If you have other resident dogs: leashed parallel introduction first, then short off-leash if calm.\n' +
        '6. Note the dog\'s arrival mood in the log: settled / anxious / over-aroused.',
      contentAr:
        'قائمة الاستقبال (افعل هذا خلال أول 30 دقيقة من الوصول):\n' +
        '1. تأكد أن الكلب يطابق الحجز (الاسم، الصورة، الشريحة إن كانت مدرجة).\n' +
        '2. اقرأ ملاحظات المالك مجدداً: الأدوية، الحساسيات، المخاوف، تاريخ السلوك.\n' +
        '3. اسأل المالك شخصياً عن أي شيء غير واضح — لا تخمن.\n' +
        '4. أرِ الكلب مكان نومه وماءه.\n' +
        '5. إذا كان لديك كلاب مقيمة: تعريف متوازٍ مع القياد أولاً، ثم لعب قصير دون قياد إذا كان الجو هادئاً.\n' +
        '6. سجل مزاج الوصول في السجل: مستقر / قلق / مفرط الإثارة.',
    },
    {
      order: 4,
      type: 'VIDEO',
      titleEn: 'Daily Care Routine',
      titleAr: 'الروتين اليومي للرعاية',
      youtubeUrl: 'https://www.youtube.com/watch?v=yTjedDxCmgg',
      durationMinutes: 14,
      contentEn:
        'Aim for the same schedule every day:\n' +
        '• Morning walk: 20–40 min depending on size + heat.\n' +
        '• Morning meal: per parent instructions; separate space.\n' +
        '• Mid-day enrichment: sniff walk, snuffle mat, frozen Kong.\n' +
        '• Afternoon nap window: 1–2 hours of dim, quiet space.\n' +
        '• Evening walk + meal: same separation rules as morning.\n' +
        '• Bedtime: lights off, white noise optional, settle within 30 mins.',
      contentAr:
        'استهدف نفس الجدول كل يوم:\n' +
        '• نزهة الصباح: 20–40 دقيقة حسب الحجم والحرارة.\n' +
        '• وجبة الصباح: حسب تعليمات المالك؛ مكان منفصل.\n' +
        '• إثراء منتصف اليوم: نزهة شم، حصيرة بحث، كونغ مجمد.\n' +
        '• نافذة قيلولة الظهر: 1–2 ساعة في مساحة معتمة هادئة.\n' +
        '• نزهة ووجبة المساء: نفس قواعد الفصل كالصباح.\n' +
        '• وقت النوم: الأنوار مطفأة، ضجيج أبيض اختياري، الاستقرار خلال 30 دقيقة.',
    },
    {
      order: 5,
      type: 'VIDEO',
      titleEn: 'Feeding & Medication Schedules',
      titleAr: 'جداول التغذية والدواء',
      youtubeUrl: 'https://www.youtube.com/watch?v=MWv7C13cMr4',
      durationMinutes: 12,
      contentEn:
        'For boarding-length stays:\n' +
        '• Use the parent\'s food. Do not switch brands; abrupt diet changes cause GI upset.\n' +
        '• Pre-portion meals at intake. Photograph the labelled bag for the log.\n' +
        '• Medication: confirm dose + time + method, set phone reminders, sign each administration in-app.\n' +
        '• Treats: only what the parent approves. Many dogs have hidden allergies.\n' +
        '• If the dog refuses 2 consecutive meals, message the parent and check for stress signs.',
      contentAr:
        'لإقامات بطول الإقامة الليلية:\n' +
        '• استخدم طعام المالك. لا تبدل العلامات؛ التغيير المفاجئ يسبب اضطراباً معدياً.\n' +
        '• قسم الوجبات مسبقاً عند الاستقبال. صور الكيس الملصق للسجل.\n' +
        '• الدواء: تأكد من الجرعة والوقت والطريقة، اضبط تذكيرات الهاتف، وقع كل إعطاء داخل التطبيق.\n' +
        '• الحلوى: فقط ما يوافق عليه المالك. كثير من الكلاب لديها حساسيات خفية.\n' +
        '• إذا رفض الكلب وجبتين متتاليتين، راسل المالك وافحص علامات التوتر.',
    },
    {
      order: 6,
      type: 'VIDEO',
      titleEn: 'Multi-Pet Management',
      titleAr: 'إدارة الحيوانات المتعددة',
      youtubeUrl: 'https://www.youtube.com/watch?v=yTjedDxCmgg',
      durationMinutes: 14,
      contentEn:
        'When boarding more than one pet:\n' +
        '• Always know exactly which dog is where. Mental headcount every time you change rooms.\n' +
        '• Crate or gate at sleep. Even friendly dogs do better with personal sleep space.\n' +
        '• If you have your own dog and it\'s declared "may interact", supervise every interaction for the first 24 hours regardless.\n' +
        '• Two boarders: each gets its own walk if temperaments differ. Shared walks only when calmly compatible.',
      contentAr:
        'عند إقامة أكثر من حيوان:\n' +
        '• اعرف دائماً بالضبط أي كلب في أي مكان. عد ذهني كلما غيرت غرفة.\n' +
        '• قفص أو بوابة عند النوم. حتى الكلاب الودودة أفضل مع مساحة نوم شخصية.\n' +
        '• إذا كان لديك كلبك الخاص وأُعلِن "قد يتفاعل"، أشرف على كل تفاعل أول 24 ساعة بغض النظر.\n' +
        '• اثنان مقيمان: كل واحد يحصل على نزهته الخاصة إذا اختلفت الطباع. نزهات مشتركة فقط عند توافق هادئ.',
    },
    {
      order: 7,
      type: 'VIDEO',
      titleEn: 'Overnight Monitoring & Sleep',
      titleAr: 'المراقبة الليلية والنوم',
      youtubeUrl: 'https://www.youtube.com/watch?v=Q_fMbLlNu8Q',
      durationMinutes: 14,
      contentEn:
        'Most dogs settle within 30 minutes if the routine is consistent. Common first-night behaviours:\n' +
        '• Pacing or whining for the first 15–20 minutes — usually self-resolves.\n' +
        '• Refusing the bed — try the dog\'s own blanket, lower lights, white noise.\n' +
        '• Restless dog: a final short toilet break + a Kong with frozen wet food usually settles.\n' +
        '• Persistent night anxiety past 2 hours: video-call the parent before they fall asleep — many dogs settle at the sound of their voice.',
      contentAr:
        'معظم الكلاب تستقر خلال 30 دقيقة إذا كان الروتين ثابتاً. سلوكيات الليلة الأولى الشائعة:\n' +
        '• تجوال أو أنين أول 15–20 دقيقة — عادة يحل تلقائياً.\n' +
        '• رفض السرير — جرب بطانية الكلب الخاصة، إضاءة منخفضة، ضجيج أبيض.\n' +
        '• كلب مضطرب: استراحة حمام قصيرة أخيرة + كونغ مع طعام مجمد عادة يستقر.\n' +
        '• قلق ليلي مستمر بعد ساعتين: مكالمة فيديو مع المالك قبل نومه — كثير من الكلاب تستقر على صوته.',
    },
    {
      order: 8,
      type: 'VIDEO',
      titleEn: 'Behaviour & Stress Signs',
      titleAr: 'إشارات السلوك والتوتر',
      youtubeUrl: 'https://www.youtube.com/watch?v=o2HM4-qhpH0',
      durationMinutes: 12,
      contentEn:
        'Beyond the body language module: boarding-specific patterns to watch for over multiple days:\n' +
        '• Day 2 dip: many dogs are great on day 1 then withdraw on day 2 as the novelty wears off. Add enrichment, more 1:1 time.\n' +
        '• Sudden behaviour change at 48–72 hours: could be illness onset. Check temperature, appetite, stool.\n' +
        '• Stress diarrhoea: common; fast 12 hours then offer rice + boiled chicken in small portions. Message the parent.',
      contentAr:
        'بعد وحدة لغة الجسد: أنماط خاصة بالإقامة يجب الانتباه لها على مدى أيام:\n' +
        '• هبوط اليوم الثاني: كثير من الكلاب رائعة في اليوم الأول ثم تنسحب في الثاني عند زوال الجدة. أضف إثراء ووقتاً فردياً.\n' +
        '• تغير سلوك مفاجئ في 48–72 ساعة: قد يكون بداية مرض. افحص الحرارة والشهية والبراز.\n' +
        '• إسهال توتري: شائع؛ صم 12 ساعة ثم قدم أرز ودجاج مسلوق بكميات صغيرة. راسل المالك.',
    },
    {
      order: 9,
      type: 'VIDEO',
      titleEn: 'Health, Biosecurity, & Hygiene',
      titleAr: 'الصحة والأمان الحيوي والنظافة',
      youtubeUrl: 'https://www.youtube.com/watch?v=Q_fMbLlNu8Q',
      durationMinutes: 12,
      contentEn:
        'Stays of 2+ nights with multiple dogs require disciplined hygiene:\n' +
        '• Wash hands between handling different dogs.\n' +
        '• Pick up waste immediately; never leave it overnight.\n' +
        '• Wipe down food/water bowls daily with hot soapy water.\n' +
        '• Wash bedding between bookings.\n' +
        '• If a dog shows kennel-cough symptoms (honking cough, runny nose), isolate immediately and message support — quarantine until vet-cleared.',
      contentAr:
        'إقامات ليلتين أو أكثر مع كلاب متعددة تتطلب نظافة منضبطة:\n' +
        '• اغسل اليدين بين التعامل مع كلاب مختلفة.\n' +
        '• التقط الفضلات فوراً؛ لا تتركها طوال الليل.\n' +
        '• امسح أوعية الطعام/الماء يومياً بماء ساخن صابوني.\n' +
        '• اغسل الفراش بين الحجوزات.\n' +
        '• إذا أظهر كلب أعراض السعال الكنلي (سعال نفير، أنف سائلة)، اعزله فوراً وراسل الدعم — حجر صحي حتى يصرح به الطبيب.',
    },
    {
      order: 10,
      type: 'TEXT',
      titleEn: 'Emergency Vet & Crisis Response',
      titleAr: 'الطبيب البيطري الطارئ والاستجابة للأزمات',
      durationMinutes: 12,
      contentEn:
        'Every booking starts with you saving 3 phone numbers in your phone:\n' +
        '1. Parent\'s primary number\n' +
        '2. Parent\'s emergency contact (in booking)\n' +
        '3. The 24/7 emergency vet you have agreed with the parent (or PawMateHub support: from your provider dashboard)\n\n' +
        'When to go straight to a vet without messaging first:\n' +
        '• Suspected poisoning (chocolate, grapes, cleaners, medication)\n' +
        '• Bloat signs (distended belly, retching without vomiting)\n' +
        '• Heatstroke (panting + red gums + ataxia)\n' +
        '• Trauma — even if dog seems fine\n' +
        '• Difficulty breathing\n\n' +
        'On the way: phone the parent. Send your live location.',
      contentAr:
        'كل حجز يبدأ بحفظك 3 أرقام في هاتفك:\n' +
        '1. رقم المالك الأساسي\n' +
        '2. جهة اتصال المالك للطوارئ (في الحجز)\n' +
        '3. الطبيب البيطري الطارئ على مدار الساعة الذي اتفقت عليه مع المالك (أو دعم PawMateHub: من لوحة المزود)\n\n' +
        'متى تذهب مباشرة للطبيب البيطري دون مراسلة أولاً:\n' +
        '• اشتباه تسمم (شوكولاتة، عنب، منظفات، دواء)\n' +
        '• علامات انتفاخ (بطن منتفخة، تجشؤ دون قيء)\n' +
        '• ضربة شمس (لهاث + لثة حمراء + ترنح)\n' +
        '• صدمة — حتى لو بدا الكلب بخير\n' +
        '• صعوبة تنفس\n\n' +
        'في الطريق: اتصل بالمالك. أرسل موقعك المباشر.',
    },
    {
      order: 11,
      type: 'TEXT',
      titleEn: 'Owner Communication & Daily Reports',
      titleAr: 'التواصل مع المالك والتقارير اليومية',
      durationMinutes: 8,
      contentEn:
        'For boarding, daily reports are mandatory:\n' +
        '• Morning: photo + 1-line summary of overnight + breakfast.\n' +
        '• Evening: photo or 10-second video + 2-line summary of the day (walks, mood, meals, any concerns).\n' +
        '• Bedtime: 1-line note that the dog has settled.\n\n' +
        'Tone:\n' +
        '• Specific over generic. \"Max ate 100% of his lunch and napped from 14:00–15:30 on his bed.\"\n' +
        '• Bad news, calm + immediate. \"Max had stress diarrhoea around 11:00. He drank water and is resting now. I\'ll skip his next meal and offer rice + chicken at 16:00. Photo attached.\"',
      contentAr:
        'للإقامة، التقارير اليومية إلزامية:\n' +
        '• الصباح: صورة + ملخص سطر واحد لليلة والإفطار.\n' +
        '• المساء: صورة أو فيديو 10 ثوانٍ + ملخص سطرين لليوم (نزهات، مزاج، وجبات، مخاوف).\n' +
        '• وقت النوم: ملاحظة سطر واحد بأن الكلب استقر.\n\n' +
        'النبرة:\n' +
        '• محدد بدلاً من عام. "ماكس أكل 100% من غدائه ونام من 14:00–15:30 على سريره."\n' +
        '• أخبار سيئة، بهدوء وفوراً. "ماكس أصيب بإسهال توتر حوالي 11:00. شرب ماءً ويستريح الآن. سأتخطى وجبته القادمة وأقدم أرزاً ودجاجاً 16:00. الصورة مرفقة."',
    },
    {
      order: 12,
      type: 'QUIZ',
      titleEn: 'Boarding Provider Quiz',
      titleAr: 'اختبار مزود الإقامة الليلية',
      durationMinutes: 20,
      questions: boardingQuestions(),
    },
  ],
};

function boardingQuestions(): Question[] {
  // 25 questions covering pre-arrival, intake, daily routine, multi-pet,
  // overnight, health, emergency, and parent comms.
  return [
    {
      order: 1,
      questionEn: 'Which is correct about supervision during a boarding stay?',
      questionAr: 'أيهما صحيح بخصوص الإشراف خلال إقامة ليلية؟',
      options: [
        { id: 'a', textEn: 'You can leave for groceries — dog is fine alone',         textAr: 'يمكنك الخروج للتسوق — الكلب بخير وحده' },
        { id: 'b', textEn: 'You or a declared co-host are always on-property',         textAr: 'أنت أو مساعد معلن دائماً في الموقع' },
        { id: 'c', textEn: 'You must crate the dog whenever you leave',                  textAr: 'يجب حبس الكلب في قفص كلما خرجت' },
        { id: 'd', textEn: 'A neighbour can supervise',                                  textAr: 'يمكن لجار الإشراف' },
      ],
      correctId: 'b',
      explanationEn: 'Continuous on-property supervision is one of the three boarding commitments.',
      explanationAr: 'الإشراف المستمر في الموقع أحد التزامات الإقامة الثلاثة.',
    },
    {
      order: 2,
      questionEn: 'Which is NOT a pre-arrival safety check?',
      questionAr: 'أي مما يلي ليس فحص سلامة قبل الوصول؟',
      options: [
        { id: 'a', textEn: 'Lock chocolate / xylitol out of reach', textAr: 'اغلق الشوكولاتة/الزيليتول بعيداً' },
        { id: 'b', textEn: 'Sweep for choking hazards',              textAr: 'امسح بحثاً عن مخاطر اختناق' },
        { id: 'c', textEn: 'Bake fresh treats',                       textAr: 'اخبز حلويات طازجة' },
        { id: 'd', textEn: 'Check fence/balcony gaps',                textAr: 'افحص فجوات السور/الشرفة' },
      ],
      correctId: 'c',
      explanationEn: 'Treats use is parent-approved and bake-as-you-need; pre-arrival is hazard-removal focus.',
      explanationAr: 'استخدام الحلوى يوافق عليه المالك ويخبز عند الحاجة؛ قبل الوصول يركز على إزالة المخاطر.',
    },
    {
      order: 3,
      questionEn: 'You are switching dog food brands mid-stay because the parent\'s bag ran out. What is correct?',
      questionAr: 'تبدل علامة طعام الكلب في منتصف الإقامة لأن كيس المالك انتهى. ما الصحيح؟',
      options: [
        { id: 'a', textEn: 'Use any quality brand you have',                                textAr: 'استخدم أي علامة جيدة لديك' },
        { id: 'b', textEn: 'Message the parent to deliver more or approve a switch',         textAr: 'راسل المالك ليرسل المزيد أو يوافق على التبديل' },
        { id: 'c', textEn: 'Skip meals until the parent returns',                            textAr: 'تخطَّ الوجبات حتى يعود المالك' },
        { id: 'd', textEn: 'Mix your own kibble in',                                          textAr: 'اخلط طعامك الجاف' },
      ],
      correctId: 'b',
      explanationEn: 'Abrupt diet changes cause GI upset. Always loop in the parent before switching.',
      explanationAr: 'التغيير المفاجئ في النظام الغذائي يسبب اضطراباً معدياً. دائماً اعلم المالك قبل التبديل.',
    },
    {
      order: 4,
      questionEn: 'A dog refuses two consecutive meals. What do you do?',
      questionAr: 'كلب يرفض وجبتين متتاليتين. ماذا تفعل؟',
      options: [
        { id: 'a', textEn: 'Wait it out without telling the parent',  textAr: 'انتظر دون إخبار المالك' },
        { id: 'b', textEn: 'Message the parent and check stress signs', textAr: 'راسل المالك وافحص علامات التوتر' },
        { id: 'c', textEn: 'Force-feed by hand',                       textAr: 'أطعم بالقوة باليد' },
        { id: 'd', textEn: 'Switch to your own brand',                  textAr: 'بدّل لعلامتك أنت' },
      ],
      correctId: 'b',
      explanationEn: 'Two skipped meals is a signal: notify + investigate stress.',
      explanationAr: 'وجبتان مفقودتان إشارة: أبلغ + افحص التوتر.',
    },
    {
      order: 5,
      questionEn: 'Which is the correct intake first action?',
      questionAr: 'ما الإجراء الأول الصحيح في الاستقبال؟',
      options: [
        { id: 'a', textEn: 'Verify dog matches booking + read parent notes',  textAr: 'تأكد أن الكلب يطابق الحجز + اقرأ ملاحظات المالك' },
        { id: 'b', textEn: 'Take dog to play with your own dog',                textAr: 'خذ الكلب ليلعب مع كلبك' },
        { id: 'c', textEn: 'Bathe the dog',                                      textAr: 'استحم الكلب' },
        { id: 'd', textEn: 'Cancel if the dog seems shy',                        textAr: 'ألغِ إذا بدا الكلب خجولاً' },
      ],
      correctId: 'a',
      explanationEn: 'Verify identity + read notes. Everything else flows from that.',
      explanationAr: 'تحقق من الهوية + اقرأ الملاحظات. كل شيء آخر يأتي من ذلك.',
    },
    {
      order: 6,
      questionEn: 'Sleep arrangements when boarding multiple dogs — best practice?',
      questionAr: 'ترتيبات النوم عند إقامة كلاب متعددة — أفضل ممارسة؟',
      options: [
        { id: 'a', textEn: 'All sleep in the same bed for warmth',  textAr: 'الجميع ينام في نفس السرير للدفء' },
        { id: 'b', textEn: 'Crate or gate — personal sleep space',   textAr: 'قفص أو بوابة — مساحة نوم شخصية' },
        { id: 'c', textEn: 'Free roam — they sort it out',            textAr: 'تجول حر — يتدبرون أمرهم' },
        { id: 'd', textEn: 'Outside on a balcony',                     textAr: 'بالخارج في شرفة' },
      ],
      correctId: 'b',
      explanationEn: 'Even friendly dogs do better with personal sleep space.',
      explanationAr: 'حتى الكلاب الودودة أفضل مع مساحة نوم شخصية.',
    },
    {
      order: 7,
      questionEn: 'A boarding dog has stress diarrhoea on day 2. First action?',
      questionAr: 'كلب إقامة لديه إسهال توتر في اليوم الثاني. الإجراء الأول؟',
      options: [
        { id: 'a', textEn: 'Fast 12 hours, then rice + boiled chicken in small portions; message parent', textAr: 'صيام 12 ساعة، ثم أرز + دجاج مسلوق بكميات صغيرة؛ راسل المالك' },
        { id: 'b', textEn: 'Continue normal kibble',                                                       textAr: 'استمر في الطعام الجاف العادي' },
        { id: 'c', textEn: 'Add yogurt to the food',                                                       textAr: 'أضف زبادي للطعام' },
        { id: 'd', textEn: 'Skip mentioning to parent',                                                    textAr: 'لا تذكر للمالك' },
      ],
      correctId: 'a',
      explanationEn: 'Fast + bland diet is the standard first response for stress GI; loop in the parent.',
      explanationAr: 'الصيام + النظام الخفيف هو الاستجابة الأولى للاضطراب التوتري؛ أبلغ المالك.',
    },
    {
      order: 8,
      questionEn: 'A dog won\'t settle past 2 hours into the first night. Best move?',
      questionAr: 'كلب لا يستقر بعد ساعتين من الليلة الأولى. أفضل تصرف؟',
      options: [
        { id: 'a', textEn: 'Lock the dog in a far room',                                  textAr: 'اقفل الكلب في غرفة بعيدة' },
        { id: 'b', textEn: 'Give it space and ignore',                                     textAr: 'أعطِه مساحة وتجاهله' },
        { id: 'c', textEn: 'Video-call the parent — many dogs settle to a familiar voice', textAr: 'مكالمة فيديو مع المالك — كثير من الكلاب تستقر على صوت مألوف' },
        { id: 'd', textEn: 'Take the dog for a long walk',                                  textAr: 'خذ الكلب لنزهة طويلة' },
      ],
      correctId: 'c',
      explanationEn: 'A short video call with the parent is the best first intervention before they sleep.',
      explanationAr: 'مكالمة فيديو قصيرة مع المالك أفضل تدخل أول قبل نومه.',
    },
    {
      order: 9,
      questionEn: 'Which is a "go straight to the vet without messaging first" symptom?',
      questionAr: 'أي عرض من أعراض "اذهب مباشرة للطبيب البيطري دون مراسلة أولاً"؟',
      options: [
        { id: 'a', textEn: 'A torn nail',                                       textAr: 'ظفر مكسور' },
        { id: 'b', textEn: 'Distended belly + retching without vomiting (bloat)', textAr: 'بطن منتفخة + تجشؤ دون قيء (انتفاخ)' },
        { id: 'c', textEn: 'Refusing breakfast',                                 textAr: 'رفض الإفطار' },
        { id: 'd', textEn: 'Mild scratching',                                    textAr: 'حك خفيف' },
      ],
      correctId: 'b',
      explanationEn: 'Bloat is a vet emergency. Drive immediately; phone the parent on the way.',
      explanationAr: 'الانتفاخ طوارئ بيطرية. قُد فوراً؛ اتصل بالمالك في الطريق.',
    },
    {
      order: 10,
      questionEn: 'How many phone numbers should be saved before each booking starts?',
      questionAr: 'كم رقم هاتف يجب حفظه قبل بدء كل حجز؟',
      options: [
        { id: 'a', textEn: '1 — the parent',                            textAr: '1 — المالك' },
        { id: 'b', textEn: '3 — parent, emergency contact, 24/7 vet',    textAr: '3 — المالك، جهة الطوارئ، طبيب 24/7' },
        { id: 'c', textEn: '5 — extended family',                         textAr: '5 — الأسرة الممتدة' },
        { id: 'd', textEn: 'None — call support each time',                textAr: 'لا شيء — اتصل بالدعم كل مرة' },
      ],
      correctId: 'b',
      explanationEn: 'Three numbers: parent, emergency contact, 24/7 vet.',
      explanationAr: 'ثلاثة أرقام: المالك، جهة الطوارئ، طبيب 24/7.',
    },
    {
      order: 11,
      questionEn: 'What is the correct daily reporting cadence for a boarding stay?',
      questionAr: 'ما إيقاع التقرير اليومي الصحيح لإقامة ليلية؟',
      options: [
        { id: 'a', textEn: 'Morning + evening + bedtime',     textAr: 'صباح + مساء + قبل النوم' },
        { id: 'b', textEn: 'Once at the end',                  textAr: 'مرة في النهاية' },
        { id: 'c', textEn: 'Only when something is wrong',     textAr: 'فقط عند وجود مشكلة' },
        { id: 'd', textEn: 'Every hour',                        textAr: 'كل ساعة' },
      ],
      correctId: 'a',
      explanationEn: 'Daily morning + evening + bedtime are mandatory.',
      explanationAr: 'صباح + مساء + قبل النوم إلزامية.',
    },
    {
      order: 12,
      questionEn: 'Day-2 dip in mood — what does this typically mean?',
      questionAr: 'هبوط مزاج اليوم الثاني — ماذا يعني عادة؟',
      options: [
        { id: 'a', textEn: 'Dog is sick — emergency vet',                                              textAr: 'الكلب مريض — طبيب طوارئ' },
        { id: 'b', textEn: 'Novelty has worn off; add enrichment + 1:1 time',                           textAr: 'زالت الجدة؛ أضف إثراء ووقتاً فردياً' },
        { id: 'c', textEn: 'Owner is bad',                                                              textAr: 'المالك سيء' },
        { id: 'd', textEn: 'Dog wants new food',                                                        textAr: 'الكلب يريد طعاماً جديداً' },
      ],
      correctId: 'b',
      explanationEn: 'Day-2 withdrawal is common. Increase enrichment and 1:1 attention.',
      explanationAr: 'انسحاب اليوم الثاني شائع. زد الإثراء والوقت الفردي.',
    },
    {
      order: 13,
      questionEn: 'A boarding dog shows kennel-cough symptoms. What do you do?',
      questionAr: 'كلب إقامة يظهر أعراض السعال الكنلي. ماذا تفعل؟',
      options: [
        { id: 'a', textEn: 'Continue mixing with other dogs', textAr: 'استمر في خلطه مع الكلاب الأخرى' },
        { id: 'b', textEn: 'Isolate immediately + message support — quarantine until vet-clears', textAr: 'اعزل فوراً + راسل الدعم — حجر صحي حتى يصرح الطبيب' },
        { id: 'c', textEn: 'Treat with cough medicine',          textAr: 'عالج بدواء سعال' },
        { id: 'd', textEn: 'Wait 48 hours to see if it spreads', textAr: 'انتظر 48 ساعة لترى هل ينتشر' },
      ],
      correctId: 'b',
      explanationEn: 'Kennel cough is highly contagious. Isolate + escalate immediately.',
      explanationAr: 'السعال الكنلي شديد العدوى. اعزل + صعد فوراً.',
    },
    {
      order: 14,
      questionEn: 'Multi-dog walk strategy — when do you walk together?',
      questionAr: 'استراتيجية نزهة متعددة الكلاب — متى تمشي معاً؟',
      options: [
        { id: 'a', textEn: 'Always — saves time',                              textAr: 'دائماً — يوفر الوقت' },
        { id: 'b', textEn: 'Only when calmly compatible; otherwise individually', textAr: 'فقط عند توافق هادئ؛ وإلا فردياً' },
        { id: 'c', textEn: 'Only with one leash',                                 textAr: 'فقط بقياد واحد' },
        { id: 'd', textEn: 'Never',                                                textAr: 'أبداً' },
      ],
      correctId: 'b',
      explanationEn: 'Compatibility-first — solo walks if temperaments differ.',
      explanationAr: 'التوافق أولاً — نزهات فردية إذا اختلفت الطباع.',
    },
    {
      order: 15,
      questionEn: 'Where should crates be placed for sleeping?',
      questionAr: 'أين يجب وضع الأقفاص للنوم؟',
      options: [
        { id: 'a', textEn: 'In a quiet spot, door open by default',  textAr: 'في مكان هادئ، الباب مفتوح افتراضياً' },
        { id: 'b', textEn: 'In the kitchen near food smells',          textAr: 'في المطبخ قرب روائح الطعام' },
        { id: 'c', textEn: 'In direct sunlight to warm them',          textAr: 'في ضوء شمس مباشر لتدفئتهم' },
        { id: 'd', textEn: 'Outside on the balcony',                    textAr: 'بالخارج في الشرفة' },
      ],
      correctId: 'a',
      explanationEn: 'Quiet spot, door open by default for crate-trained dogs.',
      explanationAr: 'مكان هادئ، الباب مفتوح افتراضياً للكلاب المدربة على القفص.',
    },
    {
      order: 16,
      questionEn: 'Which substance must absolutely be locked away from a boarding dog?',
      questionAr: 'أي مادة يجب قفلها بعيداً عن كلب الإقامة؟',
      options: [
        { id: 'a', textEn: 'Carrots',                                     textAr: 'جزر' },
        { id: 'b', textEn: 'Chocolate, grapes, xylitol gum, cleaners',     textAr: 'شوكولاتة، عنب، علكة زيليتول، منظفات' },
        { id: 'c', textEn: 'Apples',                                       textAr: 'تفاح' },
        { id: 'd', textEn: 'Plain rice',                                    textAr: 'أرز عادي' },
      ],
      correctId: 'b',
      explanationEn: 'These are all common dog toxins.',
      explanationAr: 'كلها سموم شائعة للكلاب.',
    },
    {
      order: 17,
      questionEn: 'What time do you log a 13:00 medication administration?',
      questionAr: 'متى تسجل إعطاء دواء الساعة 13:00؟',
      options: [
        { id: 'a', textEn: 'Right after administering, with photo + signature', textAr: 'فوراً بعد الإعطاء، مع صورة وتوقيع' },
        { id: 'b', textEn: 'At the end of the day',                                textAr: 'في نهاية اليوم' },
        { id: 'c', textEn: 'When the dog leaves',                                  textAr: 'عند مغادرة الكلب' },
        { id: 'd', textEn: 'Only if asked',                                         textAr: 'فقط عند الطلب' },
      ],
      correctId: 'a',
      explanationEn: 'Sign + photograph immediately after administering — audit trail.',
      explanationAr: 'وقع وصور فوراً بعد الإعطاء — سجل المراجعة.',
    },
    {
      order: 18,
      questionEn: 'A boarding dog escapes the garden through a gap. What do you do FIRST?',
      questionAr: 'كلب إقامة هرب من الحديقة عبر فجوة. ماذا تفعل أولاً؟',
      options: [
        { id: 'a', textEn: 'Search the immediate area + call the parent within minutes', textAr: 'ابحث في المنطقة المباشرة + اتصل بالمالك خلال دقائق' },
        { id: 'b', textEn: 'Wait 30 min to see if it returns',                            textAr: 'انتظر 30 دقيقة لترى هل يعود' },
        { id: 'c', textEn: 'Call the police only',                                         textAr: 'اتصل بالشرطة فقط' },
        { id: 'd', textEn: 'Don\'t mention to the parent',                                  textAr: 'لا تذكر للمالك' },
      ],
      correctId: 'a',
      explanationEn: 'Immediate search + parent contact within minutes is non-negotiable.',
      explanationAr: 'البحث الفوري + الاتصال بالمالك خلال دقائق غير قابل للتفاوض.',
    },
    {
      order: 19,
      questionEn: 'Which water-bowl rule is correct?',
      questionAr: 'أي قاعدة وعاء الماء صحيحة؟',
      options: [
        { id: 'a', textEn: 'One bowl shared',                                            textAr: 'وعاء واحد مشترك' },
        { id: 'b', textEn: 'At least two bowls; refilled twice daily; wiped daily',       textAr: 'وعاءان على الأقل؛ يعاد ملؤهما مرتين يومياً؛ يمسحان يومياً' },
        { id: 'c', textEn: 'No bowls — give a bottle as needed',                           textAr: 'لا أوعية — أعطِ زجاجة عند الحاجة' },
        { id: 'd', textEn: 'Outside only',                                                  textAr: 'بالخارج فقط' },
      ],
      correctId: 'b',
      explanationEn: 'Two bowls minimum, refilled twice daily, wiped down daily for hygiene.',
      explanationAr: 'وعاءان كحد أدنى، يعاد ملؤهما مرتين يومياً، يمسحان يومياً للنظافة.',
    },
    {
      order: 20,
      questionEn: 'What is the correct first-night schedule for a new boarder?',
      questionAr: 'ما الجدول الصحيح لليلة الأولى لمقيم جديد؟',
      options: [
        { id: 'a', textEn: 'Long walk → big dinner → late bedtime',                          textAr: 'نزهة طويلة → عشاء كبير → نوم متأخر' },
        { id: 'b', textEn: 'Calm intake → familiar bed/blanket → routine bedtime, low lights', textAr: 'استقبال هادئ → سرير/بطانية مألوفة → نوم روتيني، إضاءة منخفضة' },
        { id: 'c', textEn: 'Skip dinner so the dog sleeps faster',                           textAr: 'تخطَّ العشاء ليتأقلم الكلب على النوم أسرع' },
        { id: 'd', textEn: 'Lots of new toys to distract',                                    textAr: 'الكثير من الألعاب الجديدة للإلهاء' },
      ],
      correctId: 'b',
      explanationEn: 'A predictable, calm first night settles dogs faster.',
      explanationAr: 'ليلة أولى هادئة ومتوقعة تساعد الكلاب على الاستقرار أسرع.',
    },
    {
      order: 21,
      questionEn: 'Photographing the parent\'s pre-portioned food bag at intake is for…',
      questionAr: 'تصوير كيس الطعام المقسم من المالك عند الاستقبال هو لـ…',
      options: [
        { id: 'a', textEn: 'Posting on social media',           textAr: 'النشر على وسائل التواصل' },
        { id: 'b', textEn: 'The audit log + future reference',   textAr: 'سجل المراجعة + المرجع المستقبلي' },
        { id: 'c', textEn: 'Decoration',                          textAr: 'الديكور' },
        { id: 'd', textEn: 'No reason — optional',                 textAr: 'لا سبب — اختياري' },
      ],
      correctId: 'b',
      explanationEn: 'Photo of the labelled food bag goes into the in-app log.',
      explanationAr: 'صورة كيس الطعام الملصق توضع في السجل داخل التطبيق.',
    },
    {
      order: 22,
      questionEn: 'A dog ate something unknown off the floor. Best action?',
      questionAr: 'كلب أكل شيئاً مجهولاً من الأرض. أفضل إجراء؟',
      options: [
        { id: 'a', textEn: 'Wait and see',                                       textAr: 'انتظر وراقب' },
        { id: 'b', textEn: 'Identify the substance if possible; call the vet — many household items are toxic', textAr: 'حدد المادة إن أمكن؛ اتصل بالطبيب البيطري — كثير من الأدوات المنزلية سامة' },
        { id: 'c', textEn: 'Give the dog milk to neutralise',                     textAr: 'أعطِ الكلب حليباً للمعادلة' },
        { id: 'd', textEn: 'Take a long walk to settle the stomach',               textAr: 'خذ نزهة طويلة لتهدئة المعدة' },
      ],
      correctId: 'b',
      explanationEn: 'Identify + call vet. Don\'t wait. Don\'t induce vomiting unguided.',
      explanationAr: 'حدد + اتصل بالطبيب. لا تنتظر. لا تحفز قيئاً دون توجيه.',
    },
    {
      order: 23,
      questionEn: 'A multi-dog booking includes your own resident dog declared "may interact". For how long must you supervise every interaction?',
      questionAr: 'حجز متعدد الكلاب يتضمن كلبك المقيم المعلن "قد يتفاعل". كم يجب أن تشرف على كل تفاعل؟',
      options: [
        { id: 'a', textEn: 'First hour',           textAr: 'الساعة الأولى' },
        { id: 'b', textEn: 'First 24 hours',       textAr: 'أول 24 ساعة' },
        { id: 'c', textEn: 'No supervision needed', textAr: 'لا حاجة للإشراف' },
        { id: 'd', textEn: 'Only at meals',          textAr: 'فقط في الوجبات' },
      ],
      correctId: 'b',
      explanationEn: 'Supervise every interaction for the first 24 hours regardless of declared compatibility.',
      explanationAr: 'أشرف على كل تفاعل أول 24 ساعة بغض النظر عن التوافق المعلن.',
    },
    {
      order: 24,
      questionEn: 'Tone for a stress-diarrhoea daily report — best opener?',
      questionAr: 'نبرة تقرير يومي عن إسهال توتر — أفضل افتتاحية؟',
      options: [
        { id: 'a', textEn: '\"Everything is fine!\"',                                                          textAr: '"كل شيء بخير!"' },
        { id: 'b', textEn: '\"Max had stress diarrhoea around 11:00. He drank water, is resting now. Plan: skip next meal, rice + chicken at 16:00. Photo attached.\"', textAr: '"ماكس أصيب بإسهال توتر حوالي 11:00. شرب ماءً ويستريح الآن. الخطة: تخطي الوجبة القادمة، أرز ودجاج 16:00. الصورة مرفقة."' },
        { id: 'c', textEn: '\"Don\'t worry, just a bit of diarrhoea\"',                                         textAr: '"لا تقلق، فقط القليل من الإسهال"' },
        { id: 'd', textEn: 'Don\'t mention it',                                                                 textAr: 'لا تذكره' },
      ],
      correctId: 'b',
      explanationEn: 'Specific facts + your plan + a photo. Builds trust and prevents owner panic.',
      explanationAr: 'حقائق محددة + خطتك + صورة. يبني الثقة ويمنع ذعر المالك.',
    },
    {
      order: 25,
      questionEn: 'Multi-dog booking with one dog showing kennel-cough symptoms. What changes?',
      questionAr: 'حجز متعدد الكلاب وأحدهم يظهر أعراض السعال الكنلي. ما الذي يتغير؟',
      options: [
        { id: 'a', textEn: 'No change',                                                                   textAr: 'لا تغيير' },
        { id: 'b', textEn: 'Isolate the symptomatic dog; warn the other parents in writing; quarantine until vet-cleared', textAr: 'اعزل الكلب العرضي؛ حذر المالكين الآخرين كتابياً؛ حجر صحي حتى يصرح الطبيب' },
        { id: 'c', textEn: 'Cancel only the symptomatic dog\'s booking',                                    textAr: 'ألغِ فقط حجز الكلب العرضي' },
        { id: 'd', textEn: 'Send all dogs home together',                                                  textAr: 'أرسل كل الكلاب للبيت معاً' },
      ],
      correctId: 'b',
      explanationEn: 'Isolate + written warnings + quarantine. Liability + duty of care.',
      explanationAr: 'اعزل + تحذيرات مكتوبة + حجر صحي. مسؤولية وواجب رعاية.',
    },
  ];
}

// ═══════════════════════════════════════════════════════════════════════════
// Seeder
// ═══════════════════════════════════════════════════════════════════════════
const ALL_COURSES: CourseSeed[] = [WALKER_SAFETY, DAY_CARE, BOARDING];

async function seed() {
  for (const courseSeed of ALL_COURSES) {
    console.log(`\n=== ${courseSeed.id} ===`);

    // Course row — upsert by id (CourseId enum PK).
    await prisma.course.upsert({
      where: { id: courseSeed.id },
      create: {
        id: courseSeed.id,
        titleEn: courseSeed.titleEn,
        titleAr: courseSeed.titleAr,
        descriptionEn: courseSeed.descriptionEn,
        descriptionAr: courseSeed.descriptionAr,
        totalLessons: courseSeed.lessons.length,
        estimatedMinutes: courseSeed.estimatedMinutes,
        passScore: courseSeed.passScore,
        isActive: true,
      },
      update: {
        titleEn: courseSeed.titleEn,
        titleAr: courseSeed.titleAr,
        descriptionEn: courseSeed.descriptionEn,
        descriptionAr: courseSeed.descriptionAr,
        totalLessons: courseSeed.lessons.length,
        estimatedMinutes: courseSeed.estimatedMinutes,
        passScore: courseSeed.passScore,
        isActive: true,
      },
    });

    for (const lesson of courseSeed.lessons) {
      // Upsert lesson by (courseId, order). Re-runs update content in-place
      // so existing CourseEnrollment.currentLesson references stay valid.
      const lessonRow = await prisma.courseLesson.upsert({
        where: {
          courseId_order: { courseId: courseSeed.id, order: lesson.order },
        },
        create: {
          courseId: courseSeed.id,
          order: lesson.order,
          type: lesson.type,
          titleEn: lesson.titleEn,
          titleAr: lesson.titleAr,
          youtubeUrl: lesson.youtubeUrl ?? null,
          durationMinutes: lesson.durationMinutes ?? null,
          contentEn: lesson.contentEn ?? null,
          contentAr: lesson.contentAr ?? null,
        },
        update: {
          type: lesson.type,
          titleEn: lesson.titleEn,
          titleAr: lesson.titleAr,
          youtubeUrl: lesson.youtubeUrl ?? null,
          durationMinutes: lesson.durationMinutes ?? null,
          contentEn: lesson.contentEn ?? null,
          contentAr: lesson.contentAr ?? null,
        },
      });

      console.log(
        `  L${lesson.order} ${lesson.type.padEnd(5)} ${lesson.titleEn}`,
      );

      if (lesson.type === 'QUIZ' && lesson.questions?.length) {
        // Replace the question bank wholesale on every run so editing a
        // question in this file is the canonical edit path. Questions
        // have no FK references, so deleteMany is safe.
        await prisma.quizQuestion.deleteMany({
          where: { lessonId: lessonRow.id },
        });
        await prisma.quizQuestion.createMany({
          data: lesson.questions.map((q) => ({
            lessonId: lessonRow.id,
            order: q.order,
            questionEn: q.questionEn,
            questionAr: q.questionAr,
            options: q.options as any,
            correctId: q.correctId,
            explanationEn: q.explanationEn,
            explanationAr: q.explanationAr,
          })),
        });
        console.log(`     · ${lesson.questions.length} quiz questions`);
      }
    }
  }

  console.log('\n✅ Seed complete.');
}

seed()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
