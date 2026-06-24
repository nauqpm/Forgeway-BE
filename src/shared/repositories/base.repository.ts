import {
  Model,
  Document,
  FilterQuery,
  UpdateQuery,
  ProjectionType,
  QueryOptions,
  ClientSession,
} from 'mongoose';

export abstract class BaseRepository<TDocument extends Document> {
  constructor(public readonly model: Model<TDocument>) {}

  normalizePagination(options: { page?: number; limit?: number }): {
    page: number;
    limit: number;
    skip: number;
  } {
    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(options.limit) || 20));
    return { page, limit, skip: (page - 1) * limit };
  }

  buildSort(
    sortBy?: string,
    sortOrder?: string,
    defaultSort: Record<string, 1 | -1> = { createdAt: -1 },
  ): Record<string, 1 | -1> {
    if (!sortBy) {
      return defaultSort;
    }
    const direction = sortOrder === 'asc' ? 1 : -1;
    return { [sortBy]: direction, _id: direction };
  }

  buildSoftDeleteFilter(_includeDeleted = false): FilterQuery<TDocument> {
    return {};
  }

  async create(
    data: Partial<TDocument> | any,
    session?: ClientSession,
  ): Promise<TDocument> {
    const created = new this.model(data);
    if (session) {
      return created.save({ session }) as Promise<TDocument>;
    }
    return created.save() as Promise<TDocument>;
  }

  async findById(
    id: string,
    projection?: ProjectionType<TDocument>,
    options?: QueryOptions<TDocument>,
  ): Promise<TDocument | null> {
    return this.model.findById(id, projection, options).exec();
  }

  async findOne(
    filter: FilterQuery<TDocument>,
    projection?: ProjectionType<TDocument>,
    options?: QueryOptions<TDocument>,
  ): Promise<TDocument | null> {
    return this.model.findOne(filter, projection, options).exec();
  }

  async find(
    filter: FilterQuery<TDocument>,
    projection?: ProjectionType<TDocument>,
    options?: QueryOptions<TDocument>,
  ): Promise<TDocument[]> {
    return this.model.find(filter, projection, options).exec();
  }

  async update(
    id: string,
    updateData: UpdateQuery<TDocument> | Partial<TDocument>,
    options: QueryOptions<TDocument> = { new: true },
  ): Promise<TDocument | null> {
    return this.model.findByIdAndUpdate(id, updateData, options).exec();
  }

  async delete(id: string): Promise<any> {
    return this.model.findByIdAndDelete(id).exec();
  }

  async paginate(
    filter: FilterQuery<TDocument>,
    options: {
      page?: number;
      limit?: number;
      sort?: any;
      populate?: any;
      projection?: ProjectionType<TDocument>;
      lean?: boolean;
    } = {},
  ): Promise<{
    items: TDocument[];
    total: number;
    page: number;
    limit: number;
  }> {
    const { page, limit, skip } = this.normalizePagination(options);
    const query = this.model.find(filter);

    if (options.projection) {
      query.select(options.projection);
    }
    if (options.sort) {
      query.sort(options.sort);
    }
    if (options.populate) {
      query.populate(options.populate);
    }
    query.skip(skip).limit(limit);

    if (options.lean) {
      query.lean();
    }

    const [items, total] = await Promise.all([
      query.exec(),
      this.model.countDocuments(filter).exec(),
    ]);

    return { items, total, page, limit };
  }
}
