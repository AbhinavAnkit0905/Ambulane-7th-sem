import { PrismaClient, UserRole, AmbulanceStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  const passwordHash = await bcrypt.hash('password123', 10);

  // Configurable base coordinates
  const baseLat = parseFloat(process.env.DEMO_LAT || '28.6139');
  const baseLng = parseFloat(process.env.DEMO_LNG || '77.2090');

  // 1. Create Hospitals
  const hospitalGeneral = await prisma.hospital.upsert({
    where: { id: 'hosp-001' },
    update: {},
    create: {
      id: 'hosp-001',
      name: 'City General Hospital & Trauma Centre',
      address: '42 Emergency Blvd, Medical District',
      latitude: baseLat + 0.035, // ~3.8km north
      longitude: baseLng + 0.025,
      phone: '+1-555-911-01',
      emergencyDepartmentOpen: true,
      icuAvailable: true,
      icuBeds: 18,
      totalAvailableBeds: 65,
      receivingCapacity: 90
    }
  });

  const hospitalMetro = await prisma.hospital.upsert({
    where: { id: 'hosp-002' },
    update: {},
    create: {
      id: 'hosp-002',
      name: 'Metro Apex Super-Speciality Hospital',
      address: '109 Crossfield Ave, Central Sector',
      latitude: baseLat - 0.028,
      longitude: baseLng + 0.015,
      phone: '+1-555-911-02',
      emergencyDepartmentOpen: true,
      icuAvailable: true,
      icuBeds: 8,
      totalAvailableBeds: 24,
      receivingCapacity: 75
    }
  });

  // 2. Create Users
  const admin = await prisma.user.upsert({
    where: { email: 'admin@ambulane.emergency' },
    update: {},
    create: {
      id: 'user-admin-01',
      name: 'Chief Dispatcher Admin',
      email: 'admin@ambulane.emergency',
      passwordHash,
      role: UserRole.ADMIN,
      phone: '+1-555-000-0001'
    }
  });

  const ambDriver = await prisma.user.upsert({
    where: { email: 'driver@ambulane.emergency' },
    update: {},
    create: {
      id: 'user-driver-01',
      name: 'Capt. Marcus Vance',
      email: 'driver@ambulane.emergency',
      passwordHash,
      role: UserRole.AMBULANCE_DRIVER,
      phone: '+1-555-000-0002'
    }
  });

  const normalUserA = await prisma.user.upsert({
    where: { email: 'driver_a@user.test' },
    update: {},
    create: {
      id: 'user-normal-a',
      name: 'Alex Rivera (Demo Driver A - 500m)',
      email: 'driver_a@user.test',
      passwordHash,
      role: UserRole.NORMAL_USER,
      phone: '+1-555-000-0003'
    }
  });

  const normalUserB = await prisma.user.upsert({
    where: { email: 'driver_b@user.test' },
    update: {},
    create: {
      id: 'user-normal-b',
      name: 'Bethany Clark (Demo Driver B - 1.2km)',
      email: 'driver_b@user.test',
      passwordHash,
      role: UserRole.NORMAL_USER,
      phone: '+1-555-000-0004'
    }
  });

  const normalUserC = await prisma.user.upsert({
    where: { email: 'driver_c@user.test' },
    update: {},
    create: {
      id: 'user-normal-c',
      name: 'Carlos Ruiz (Demo Driver C - 3km)',
      email: 'driver_c@user.test',
      passwordHash,
      role: UserRole.NORMAL_USER,
      phone: '+1-555-000-0005'
    }
  });

  const hospitalOperator = await prisma.user.upsert({
    where: { email: 'operator@hospital.test' },
    update: {},
    create: {
      id: 'user-hospital-op',
      name: 'Dr. Sarah Connor',
      email: 'operator@hospital.test',
      passwordHash,
      role: UserRole.HOSPITAL_OPERATOR,
      hospitalId: hospitalGeneral.id,
      phone: '+1-555-000-0006'
    }
  });

  // 3. Create Ambulances
  const ambulance1 = await prisma.ambulance.upsert({
    where: { registrationNumber: 'EMERG-911' },
    update: {},
    create: {
      id: 'amb-001',
      registrationNumber: 'EMERG-911',
      driverId: ambDriver.id,
      status: AmbulanceStatus.AVAILABLE,
      latitude: baseLat,
      longitude: baseLng,
      speed: 0,
      heading: 0,
      accuracy: 5,
      lastLocationUpdate: new Date()
    }
  });

  const ambulance2 = await prisma.ambulance.upsert({
    where: { registrationNumber: 'EMERG-912' },
    update: {},
    create: {
      id: 'amb-002',
      registrationNumber: 'EMERG-912',
      driverId: null,
      status: AmbulanceStatus.AVAILABLE,
      latitude: baseLat + 0.015,
      longitude: baseLng - 0.012,
      speed: 0,
      heading: 90,
      accuracy: 5,
      lastLocationUpdate: new Date()
    }
  });

  // 4. Initial User Locations based on Demo Requirements (Requirement 72)
  // Route runs roughly from baseLat, baseLng towards North-East (hospitalGeneral)
  // Driver A: ~500m from route ahead
  await prisma.userLocation.upsert({
    where: { userId: normalUserA.id },
    update: {
      latitude: baseLat + 0.005,
      longitude: baseLng + 0.004,
      accuracy: 10
    },
    create: {
      userId: normalUserA.id,
      latitude: baseLat + 0.005,
      longitude: baseLng + 0.004,
      accuracy: 10
    }
  });

  // Driver B: ~1.2km from route ahead
  await prisma.userLocation.upsert({
    where: { userId: normalUserB.id },
    update: {
      latitude: baseLat + 0.015,
      longitude: baseLng + 0.019,
      accuracy: 12
    },
    create: {
      userId: normalUserB.id,
      latitude: baseLat + 0.015,
      longitude: baseLng + 0.019,
      accuracy: 12
    }
  });

  // Driver C: ~3.5km away (outside 2000m geofence)
  await prisma.userLocation.upsert({
    where: { userId: normalUserC.id },
    update: {
      latitude: baseLat - 0.035,
      longitude: baseLng - 0.030,
      accuracy: 15
    },
    create: {
      userId: normalUserC.id,
      latitude: baseLat - 0.035,
      longitude: baseLng - 0.030,
      accuracy: 15
    }
  });

  // 5. Seed Initial Local News (Requirement 47 & 49)
  const initialNews = [
    {
      title: 'City Upgrades Emergency Smart Corridor Sensors Along Main Arteries',
      summary: 'Municipal authorities and traffic police have enabled automatic green-wave corridors and smart mobile vehicle alert relays for emergency responder vehicles.',
      source: 'Municipal Transit Bureau',
      category: 'Emergency',
      url: 'https://example.org/news/emergency-corridors'
    },
    {
      title: 'Road Maintenance Advisory: Eastern Express Corridor Lane Closures',
      summary: 'Lane resurfacing between Junction 4 and Medical Boulevard scheduled for weekend hours with emergency vehicle priority lane maintained.',
      source: 'City Roads Authority',
      category: 'Roads',
      url: 'https://example.org/news/road-advisory'
    },
    {
      title: 'Monsoon Alert: High Rainfall Expected Over Central Sectors',
      summary: 'Drivers advised to maintain safe following distances. Emergency mobility passage network operating at elevated readiness.',
      source: 'Regional Weather Center',
      category: 'Weather',
      url: 'https://example.org/news/weather-alert'
    }
  ];

  for (const n of initialNews) {
    const existing = await prisma.newsArticle.findFirst({ where: { title: n.title } });
    if (!existing) {
      await prisma.newsArticle.create({ data: n });
    }
  }

  console.log('✅ Seeding complete!');
  console.log('Admin account: admin@ambulane.emergency / password123');
  console.log('Ambulance driver: driver@ambulane.emergency / password123');
  console.log('Normal users: driver_a@user.test, driver_b@user.test, driver_c@user.test / password123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
