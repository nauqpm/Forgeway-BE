import { Types, model } from 'mongoose';
import { ChannelSchema } from './channel.schema';

const ChannelTestModel = model('ChannelSchemaSlice1Test', ChannelSchema);

const baseChannel = {
  type: 'general' as const,
  name: 'general',
  createdBy: new Types.ObjectId(),
};

describe('Channel organizationId schema field', () => {
  it('accepts null for existing channels', async () => {
    expect(ChannelSchema.path('organizationId')).toBeDefined();
    await expect(
      new ChannelTestModel({ ...baseChannel, organizationId: null }).validate(),
    ).resolves.toBeUndefined();
  });

  it('accepts a valid organizationId', async () => {
    expect(ChannelSchema.path('organizationId')).toBeDefined();
    await expect(
      new ChannelTestModel({
        ...baseChannel,
        organizationId: new Types.ObjectId(),
      }).validate(),
    ).resolves.toBeUndefined();
  });
});

describe('Channel dmParticipantKey schema field', () => {
  it('accepts null for existing channels', async () => {
    expect(ChannelSchema.path('dmParticipantKey')).toBeDefined();
    await expect(
      new ChannelTestModel({
        ...baseChannel,
        dmParticipantKey: null,
      }).validate(),
    ).resolves.toBeUndefined();
  });

  it('accepts a string value', async () => {
    expect(ChannelSchema.path('dmParticipantKey')).toBeDefined();
    await expect(
      new ChannelTestModel({
        ...baseChannel,
        dmParticipantKey: 'user-a:user-b',
      }).validate(),
    ).resolves.toBeUndefined();
  });
});
