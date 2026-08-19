export class PublicUserProfileDto {
  _id!: string;
  fullName?: string;
  email!: string;
  avatar?: string;

  constructor(data: PublicUserProfileDto) {
    Object.assign(this, data);
  }
}
