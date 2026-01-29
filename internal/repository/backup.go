package repository

import (
	"context"
	"encoding/json"
	"sort"

	"go.etcd.io/bbolt"

	"gamebk/internal/model"
)

type BackupRepository struct {
	db *bbolt.DB
}

func (r *BackupRepository) Create(ctx context.Context, b *model.Backup) error {
	b.CreatedAt = now()
	return r.db.Update(func(tx *bbolt.Tx) error {
		meta := tx.Bucket([]byte(bucketMeta))
		backups := tx.Bucket([]byte(bucketBackups))
		if meta == nil || backups == nil {
			return bbolt.ErrBucketNotFound
		}
		next := nextID(meta.Get([]byte(keyNextBackupID)))
		meta.Put([]byte(keyNextBackupID), putUint64(nil, next))
		b.ID = int64(next)

		data, err := json.Marshal(b)
		if err != nil {
			return err
		}
		return backups.Put(putUint64(nil, next), data)
	})
}

func (r *BackupRepository) ListByGameID(ctx context.Context, gameID int64) ([]model.Backup, error) {
	var out []model.Backup
	if err := r.db.View(func(tx *bbolt.Tx) error {
		backups := tx.Bucket([]byte(bucketBackups))
		if backups == nil {
			return bbolt.ErrBucketNotFound
		}
		return backups.ForEach(func(k, v []byte) error {
			var b model.Backup
			if err := json.Unmarshal(v, &b); err != nil {
				return err
			}
			if b.GameID == gameID {
				out = append(out, b)
			}
			return nil
		})
	}); err != nil {
		return nil, err
	}

	sort.Slice(out, func(i, j int) bool {
		return out[i].CreatedAt.After(out[j].CreatedAt)
	})
	return out, nil
}

func (r *BackupRepository) GetByID(ctx context.Context, id int64) (*model.Backup, error) {
	var b *model.Backup
	key := putUint64(nil, uint64(id))
	if err := r.db.View(func(tx *bbolt.Tx) error {
		backups := tx.Bucket([]byte(bucketBackups))
		if backups == nil {
			return bbolt.ErrBucketNotFound
		}
		v := backups.Get(key)
		if v == nil {
			return ErrNotFound
		}
		var obj model.Backup
		if err := json.Unmarshal(v, &obj); err != nil {
			return err
		}
		b = &obj
		return nil
	}); err != nil {
		return nil, err
	}
	return b, nil
}

func (r *BackupRepository) GetLatestByGameID(ctx context.Context, gameID int64) (*model.Backup, error) {
	list, err := r.ListByGameID(ctx, gameID)
	if err != nil {
		return nil, err
	}
	if len(list) == 0 {
		return nil, ErrNotFound
	}
	return &list[0], nil
}

func (r *BackupRepository) DeleteByID(ctx context.Context, id int64) error {
	return r.db.Update(func(tx *bbolt.Tx) error {
		backups := tx.Bucket([]byte(bucketBackups))
		if backups == nil {
			return bbolt.ErrBucketNotFound
		}
		key := putUint64(nil, uint64(id))
		if backups.Get(key) == nil {
			return ErrNotFound
		}
		return backups.Delete(key)
	})
}
