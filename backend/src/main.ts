import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { existsSync } from 'fs';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Enable CORS
  app.enableCors({
    origin: [
      'http://localhost:3000',
      'https://expressv2-production.up.railway.app',
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    credentials: true,
  });

  // Serve static files from public directory - try multiple paths
  const possiblePublicPaths = [
    join(process.cwd(), 'backend', 'public'),
    join(process.cwd(), 'public'),
    join(__dirname, '..', 'public'),
  ];

  // Find the first path that exists
  let publicPath = possiblePublicPaths[0]; // default
  for (const path of possiblePublicPaths) {
    if (existsSync(path)) {
      publicPath = path;
      break;
    }
  }

  console.log(`Using public path: ${publicPath}`);
  app.useStaticAssets(publicPath);

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();

// app.enableCors({
//   origin: [
//     'http://localhost:4200',
//     'https://panel-ecommerce.netlify.app',
//     'https://www.synerbyteperu.com', // <--- asegúrate que este esté incluido
//     'https://synerbyteperu.com',
//     'https://www.synerbyteperu.com/', // <--- puedes dejar ambos
//   ],
//   methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
//   credentials: true,
// });
