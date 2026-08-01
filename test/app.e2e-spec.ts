import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
// import * as request from 'supertest';
import request = require('supertest');
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

const describeWithMongo = process.env.MONGODB_TEST_URI
  ? describe
  : describe.skip;

describeWithMongo('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    process.env.DB_CONNECTION_STRING = process.env.MONGODB_TEST_URI;
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  }, 30000);

  afterEach(async () => {
    await app.close();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  }, 30000);
});
