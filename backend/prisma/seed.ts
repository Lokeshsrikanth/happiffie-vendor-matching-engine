import { PrismaClient } from '@prisma/client';
import { generateEmbeddings } from '../src/services/llmService';

const prisma = new PrismaClient();

const STOCK_PHOTOS: Record<string, { profile: string; portfolio: string[] }> = {
  decorator: {
    profile: 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=600&q=80',
    portfolio: [
      'https://images.unsplash.com/photo-1511285560929-80b456fea0bc?auto=format&fit=crop&w=600&q=80',
      'https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?auto=format&fit=crop&w=600&q=80'
    ]
  },
  caterer: {
    profile: 'https://images.unsplash.com/photo-1555244162-803834f70033?auto=format&fit=crop&w=600&q=80',
    portfolio: [
      'https://images.unsplash.com/photo-1495521821757-a1efb6729352?auto=format&fit=crop&w=600&q=80',
      'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=600&q=80'
    ]
  },
  photographer: {
    profile: 'https://images.unsplash.com/photo-1452780212940-6f5c0d14d848?auto=format&fit=crop&w=600&q=80',
    portfolio: [
      'https://images.unsplash.com/photo-1519225495810-7512c696505a?auto=format&fit=crop&w=600&q=80',
      'https://images.unsplash.com/photo-1607190074257-dd4b7af0309f?auto=format&fit=crop&w=600&q=80'
    ]
  },
  venue: {
    profile: 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=600&q=80',
    portfolio: [
      'https://images.unsplash.com/photo-1545232979-8bf34eb9757b?auto=format&fit=crop&w=600&q=80',
      'https://images.unsplash.com/photo-1566737236500-c8ac43014a67?auto=format&fit=crop&w=600&q=80'
    ]
  }
};

async function main() {
  console.log('Seeding database with Phase 2 enhancements and real stock images...');

  // 1. Clean existing data
  await prisma.adminAction.deleteMany();
  await prisma.vendorCalendar.deleteMany();
  await prisma.vendorPerformanceStats.deleteMany();
  await prisma.serviceArea.deleteMany();
  await prisma.vendorProfile.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.response.deleteMany();
  await prisma.invitation.deleteMany();
  await prisma.match.deleteMany();
  await prisma.requirement.deleteMany();
  await prisma.vendor.deleteMany();
  await prisma.user.deleteMany();

  console.log('Cleared existing tables.');

  // 2. Create Users
  const user = await prisma.user.create({
    data: {
      email: 'organizer@happiffie.com',
      name: 'Aditya Krishnan',
      phone: '+919876543210',
      role: 'user',
    },
  });

  const admin = await prisma.user.create({
    data: {
      email: 'admin@happiffie.com',
      name: 'Priya Sundar',
      phone: '+919999999999',
      role: 'admin',
    },
  });

  console.log(`Seeded users: ${user.name} (user), ${admin.name} (admin).`);

  // Chennai (Base: 13.0827, 80.2707)
  const chennaiLocations = [
    { name: 'Nungambakkam', lat: 13.0626, lng: 80.2376 },
    { name: 'Adyar', lat: 13.0063, lng: 80.2574 },
    { name: 'T Nagar', lat: 13.0418, lng: 80.2341 },
    { name: 'Velachery', lat: 12.9796, lng: 80.2189 },
    { name: 'OMR Sholinganallur', lat: 12.9010, lng: 80.2279 },
    { name: 'Mylapore', lat: 13.0330, lng: 80.2685 },
    { name: 'Anna Nagar', lat: 13.0850, lng: 80.2101 },
  ];

  // Bangalore (Base: 12.9716, 77.5946)
  const bangaloreLocations = [
    { name: 'Koramangala', lat: 12.9279, lng: 77.6271 },
    { name: 'Indiranagar', lat: 12.9719, lng: 77.6412 },
    { name: 'Jayanagar', lat: 12.9308, lng: 77.5838 },
    { name: 'Whitefield', lat: 12.9698, lng: 77.7499 },
    { name: 'HSR Layout', lat: 12.9141, lng: 77.6411 },
    { name: 'MG Road', lat: 12.9740, lng: 77.6085 },
    { name: 'Malleshwaram', lat: 13.0031, lng: 77.5696 },
  ];

  const categories = ['decorator', 'caterer', 'photographer', 'venue'];

  const decoratorSpecialties = [['rustic', 'floral', 'fairylights'], ['bohemian', 'pastel', 'minimalist'], ['traditional', 'marigold', 'luxury'], ['modern', 'neon', 'geometric'], ['vintage', 'garden', 'drape']];
  const catererSpecialties = [['south-indian', 'traditional', 'buffet'], ['north-indian', 'tandoor', 'chaat'], ['continental', 'fine-dining', 'live-counters'], ['fusion', 'finger-food', 'mocktails'], ['multi-cuisine', 'buffet', 'organic']];
  const photographerSpecialties = [['candid', 'cinematic', 'pre-wedding'], ['traditional', 'portrait', 'album'], ['fashion', 'destination', 'editorial'], ['minimalist', 'black-and-white', 'documentary'], ['drone', 'cinematic', 'high-speed']];
  const venueSpecialties = [['palace', 'luxury', 'indoor-hall'], ['garden', 'outdoor-lawn', 'rustic'], ['beachside', 'scenic', 'resort'], ['banquet', 'classic', 'ac-hall'], ['terrace', 'modern', 'rooftop']];

  const vendorSeedData = [];

  // Generate Chennai vendors (20)
  for (let i = 0; i < 20; i++) {
    const category = categories[i % categories.length];
    const loc = chennaiLocations[i % chennaiLocations.length];
    const suffix = i + 1;
    
    let specialties: string[] = [];
    if (category === 'decorator') specialties = decoratorSpecialties[i % decoratorSpecialties.length];
    else if (category === 'caterer') specialties = catererSpecialties[i % catererSpecialties.length];
    else if (category === 'photographer') specialties = photographerSpecialties[i % photographerSpecialties.length];
    else if (category === 'venue') specialties = venueSpecialties[i % venueSpecialties.length];

    let floor = 25000;
    let ceiling = 150000;
    if (i % 3 === 0) {
      floor = 150000;
      ceiling = 800000;
    } else if (i % 5 === 0) {
      floor = 10000;
      ceiling = 45000;
    }

    const rating = Math.round((3.8 + Math.random() * 1.2) * 10) / 10;
    const responseTime = Math.round(5 + Math.random() * 180);
    const acceptance = Math.round(50 + Math.random() * 50);
    const conversion = Math.round(5 + Math.random() * 40);
    const experience = Math.round(2 + Math.random() * 15);
    const isColdStart = i === 7 || i === 15;

    const photos = STOCK_PHOTOS[category];

    vendorSeedData.push({
      businessName: `Chennai ${category.charAt(0).toUpperCase() + category.slice(1)} Group ${suffix}`,
      category,
      contactPhone: `+9199000010${i < 10 ? '0' + i : i}`,
      operatingCity: 'Chennai',
      baseLat: loc.lat + (Math.random() - 0.5) * 0.01,
      baseLng: loc.lng + (Math.random() - 0.5) * 0.01,
      status: 'active',
      profile: {
        bio: `Premier ${category} servicing Chennai clients. Experts in styling beautiful events, especially known for ${specialties.join(', ')} decorations.`,
        budgetFloor: floor,
        budgetCeiling: ceiling,
        experienceYears: experience,
        ratingsAvg: isColdStart ? 0 : rating,
        responseTimeAvgMins: isColdStart ? 60 : responseTime,
        acceptanceRate: isColdStart ? 100 : acceptance,
        overallConversionRate: isColdStart ? 0 : conversion,
        specialties,
        isColdStart,
        imageUrl: photos.profile,
        portfolioUrls: photos.portfolio,
      },
      radiusKm: 15 + Math.round(Math.random() * 20),
    });
  }

  // Generate Bangalore vendors (20)
  for (let i = 0; i < 20; i++) {
    const category = categories[i % categories.length];
    const loc = bangaloreLocations[i % bangaloreLocations.length];
    const suffix = i + 1;

    let specialties: string[] = [];
    if (category === 'decorator') specialties = decoratorSpecialties[i % decoratorSpecialties.length];
    else if (category === 'caterer') specialties = catererSpecialties[i % catererSpecialties.length];
    else if (category === 'photographer') specialties = photographerSpecialties[i % photographerSpecialties.length];
    else if (category === 'venue') specialties = venueSpecialties[i % venueSpecialties.length];

    let floor = 30000;
    let ceiling = 180000;
    if (i % 3 === 0) {
      floor = 200000;
      ceiling = 1200000;
    } else if (i % 5 === 0) {
      floor = 15000;
      ceiling = 50000;
    }

    const rating = Math.round((3.9 + Math.random() * 1.1) * 10) / 10;
    const responseTime = Math.round(5 + Math.random() * 150);
    const acceptance = Math.round(60 + Math.random() * 40);
    const conversion = Math.round(8 + Math.random() * 35);
    const experience = Math.round(1 + Math.random() * 12);
    const isColdStart = i === 3 || i === 12;

    const photos = STOCK_PHOTOS[category];

    vendorSeedData.push({
      businessName: `Bangalore ${category.charAt(0).toUpperCase() + category.slice(1)} hub ${suffix}`,
      category,
      contactPhone: `+9199000020${i < 10 ? '0' + i : i}`,
      operatingCity: 'Bangalore',
      baseLat: loc.lat + (Math.random() - 0.5) * 0.01,
      baseLng: loc.lng + (Math.random() - 0.5) * 0.01,
      status: 'active',
      profile: {
        bio: `Fabulous ${category} in Bangalore. Known for outstanding executions in ${specialties.join(', ')} style.`,
        budgetFloor: floor,
        budgetCeiling: ceiling,
        experienceYears: experience,
        ratingsAvg: isColdStart ? 0 : rating,
        responseTimeAvgMins: isColdStart ? 60 : responseTime,
        acceptanceRate: isColdStart ? 100 : acceptance,
        overallConversionRate: isColdStart ? 0 : conversion,
        specialties,
        isColdStart,
        imageUrl: photos.profile,
        portfolioUrls: photos.portfolio,
      },
      radiusKm: 12 + Math.round(Math.random() * 18),
    });
  }

  // 4. Insert into database and generate embeddings
  for (const item of vendorSeedData) {
    const v = await prisma.vendor.create({
      data: {
        businessName: item.businessName,
        category: item.category,
        contactPhone: item.contactPhone,
        operatingCity: item.operatingCity,
        baseLat: item.baseLat,
        baseLng: item.baseLng,
        status: item.status,
        profile: {
          create: item.profile,
        },
        serviceAreas: {
          create: {
            city: item.operatingCity,
            radiusKm: item.radiusKm,
          },
        },
        performanceStats: {
          create: {
            invitesReceived: item.profile.isColdStart ? 0 : Math.round(Math.random() * 100),
            responsesCount: item.profile.isColdStart ? 0 : Math.round(Math.random() * 80),
            acceptancesCount: item.profile.isColdStart ? 0 : Math.round(Math.random() * 60),
            bookingsCount: item.profile.isColdStart ? 0 : Math.round(Math.random() * 15),
            avgResponseTimeSeconds: item.profile.isColdStart ? 0 : item.profile.responseTimeAvgMins * 60,
          },
        },
      },
    });

    // Generate specialties/bio semantic text and get 384 embeddings
    const textToEmbed = `${item.profile.specialties.join(' ')} ${item.profile.bio}`;
    const embedding = await generateEmbeddings(textToEmbed);
    
    // Store vector embedding using direct SQL query to bypass Unsupported Prisma type limitations
    const vectorString = `[${embedding.join(',')}]`;
    await prisma.$executeRawUnsafe(
      `UPDATE vendor_profiles SET embedding = $1::vector WHERE vendor_id = $2::uuid`,
      vectorString,
      v.id
    );

    // Seed some blocked dates for about half the vendors
    if (Math.random() > 0.5) {
      await prisma.vendorCalendar.create({
        data: {
          vendorId: v.id,
          blockedDate: new Date('2026-10-12'),
          reason: 'Fully booked for a major wedding',
        },
      });
    }
  }

  console.log(`Successfully seeded ${vendorSeedData.length} vendors with pgvector embeddings.`);
  console.log('Seeding process complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
