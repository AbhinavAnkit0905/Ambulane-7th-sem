import { Router } from 'express';
import { authController, registerSchema, loginSchema } from '../controllers/auth.controller';
import { usersController, userLocationSchema } from '../controllers/users.controller';
import { ambulancesController, locationSchema, statusSchema } from '../controllers/ambulances.controller';
import { emergenciesController, createEmergencySchema, hospitalRouteSchema } from '../controllers/emergencies.controller';
import { routesController, routeQuerySchema } from '../controllers/routes.controller';
import { hospitalsController } from '../controllers/hospitals.controller';
import { alertsController } from '../controllers/alerts.controller';
import { newsController, weatherController } from '../controllers/news.controller';
import { adminController } from '../controllers/admin.controller';
import { authenticateToken } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validateBody } from '../middleware/validate';
import { UserRole } from '@smart-ambulance/shared';

const router = Router();

// --- AUTH ---
router.post('/auth/register', validateBody(registerSchema), (req, res, next) => authController.register(req, res, next));
router.post('/auth/login', validateBody(loginSchema), (req, res, next) => authController.login(req, res, next));
router.post('/auth/logout', (req, res) => authController.logout(req, res));
router.get('/auth/me', authenticateToken, (req, res) => authController.me(req, res));

// --- USERS ---
router.post('/users/location', authenticateToken, validateBody(userLocationSchema), (req, res, next) =>
  usersController.updateLocation(req, res, next)
);
router.get('/users/me', authenticateToken, (req, res, next) => usersController.getMe(req, res, next));

// --- AMBULANCES ---
router.get('/ambulances', authenticateToken, (req, res, next) => ambulancesController.getAll(req, res, next));
router.get('/ambulances/:id', authenticateToken, (req, res, next) => ambulancesController.getById(req, res, next));
router.post(
  '/ambulances/:id/location',
  authenticateToken,
  requireRole(UserRole.ADMIN, UserRole.AMBULANCE_DRIVER),
  validateBody(locationSchema),
  (req, res, next) => ambulancesController.updateLocation(req, res, next)
);
router.patch(
  '/ambulances/:id/status',
  authenticateToken,
  requireRole(UserRole.ADMIN, UserRole.AMBULANCE_DRIVER),
  validateBody(statusSchema),
  (req, res, next) => ambulancesController.updateStatus(req, res, next)
);

// --- EMERGENCIES ---
router.get('/emergencies', authenticateToken, (req, res, next) => emergenciesController.getAll(req, res, next));
router.get('/emergencies/:id', authenticateToken, (req, res, next) => emergenciesController.getById(req, res, next));
router.post(
  '/emergencies',
  authenticateToken,
  requireRole(UserRole.ADMIN, UserRole.AMBULANCE_DRIVER),
  validateBody(createEmergencySchema),
  (req, res, next) => emergenciesController.create(req, res, next)
);
router.post(
  '/emergencies/:id/start',
  authenticateToken,
  requireRole(UserRole.ADMIN, UserRole.AMBULANCE_DRIVER),
  (req, res, next) => emergenciesController.start(req, res, next)
);
router.post(
  '/emergencies/:id/arrive-patient',
  authenticateToken,
  requireRole(UserRole.ADMIN, UserRole.AMBULANCE_DRIVER),
  (req, res, next) => emergenciesController.arrivePatient(req, res, next)
);
router.post(
  '/emergencies/:id/pickup',
  authenticateToken,
  requireRole(UserRole.ADMIN, UserRole.AMBULANCE_DRIVER),
  (req, res, next) => emergenciesController.pickupPatient(req, res, next)
);
router.post(
  '/emergencies/:id/start-hospital-route',
  authenticateToken,
  requireRole(UserRole.ADMIN, UserRole.AMBULANCE_DRIVER),
  validateBody(hospitalRouteSchema),
  (req, res, next) => emergenciesController.startHospitalRoute(req, res, next)
);
router.post(
  '/emergencies/:id/arrive-hospital',
  authenticateToken,
  requireRole(UserRole.ADMIN, UserRole.AMBULANCE_DRIVER),
  (req, res, next) => emergenciesController.arriveHospital(req, res, next)
);
router.post(
  '/emergencies/:id/complete',
  authenticateToken,
  requireRole(UserRole.ADMIN, UserRole.AMBULANCE_DRIVER),
  (req, res, next) => emergenciesController.complete(req, res, next)
);
router.post(
  '/emergencies/:id/cancel',
  authenticateToken,
  requireRole(UserRole.ADMIN, UserRole.AMBULANCE_DRIVER),
  (req, res, next) => emergenciesController.cancel(req, res, next)
);

// --- ROUTES ---
router.post('/routes/normal', validateBody(routeQuerySchema), (req, res, next) =>
  routesController.calculateNormalRoute(req, res, next)
);
router.post('/routes/emergency', validateBody(routeQuerySchema), (req, res, next) =>
  routesController.calculateEmergencyRoute(req, res, next)
);
router.post('/routes/recalculate', validateBody(routeQuerySchema), (req, res, next) =>
  routesController.recalculateRoute(req, res, next)
);
router.get('/routes/places/search', (req, res, next) =>
  routesController.searchPlaces(req, res, next)
);
router.get('/routes/places/reverse', (req, res, next) =>
  routesController.reverseGeocode(req, res, next)
);

// --- HOSPITALS ---
router.get('/hospitals', (req, res, next) => hospitalsController.getAll(req, res, next));
router.get('/hospitals/nearby', (req, res, next) => hospitalsController.getNearby(req, res, next));
router.patch(
  '/hospitals/:id/capacity',
  authenticateToken,
  requireRole(UserRole.ADMIN, UserRole.HOSPITAL_OPERATOR),
  (req, res, next) => hospitalsController.updateCapacity(req, res, next)
);

// --- ALERTS ---
router.get('/alerts', authenticateToken, (req, res, next) => alertsController.getMyAlerts(req, res, next));
router.patch('/alerts/:id/read', authenticateToken, (req, res, next) => alertsController.markRead(req, res, next));

// --- NEWS & WEATHER ---
router.get('/news/local', (req, res, next) => newsController.getLocalNews(req, res, next));
router.get('/weather', (req, res, next) => weatherController.getWeather(req, res, next));

// --- ADMIN ---
router.get('/admin/dashboard', authenticateToken, requireRole(UserRole.ADMIN), (req, res, next) =>
  adminController.getDashboard(req, res, next)
);
router.get('/admin/emergencies', authenticateToken, requireRole(UserRole.ADMIN), (req, res, next) =>
  adminController.getEmergencies(req, res, next)
);
router.get('/admin/analytics', authenticateToken, requireRole(UserRole.ADMIN), (req, res, next) =>
  adminController.getAnalytics(req, res, next)
);
router.post('/admin/demo/start', authenticateToken, requireRole(UserRole.ADMIN), (req, res, next) =>
  adminController.startDemo(req, res, next)
);
router.post('/admin/demo/stop', authenticateToken, requireRole(UserRole.ADMIN), (req, res) =>
  adminController.stopDemo(req, res)
);
router.get('/admin/demo/status', authenticateToken, requireRole(UserRole.ADMIN), (req, res) =>
  adminController.getDemoStatus(req, res)
);

export default router;
