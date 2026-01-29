package repository

import (
	"context"
	"encoding/json"
	"time"

	"go.etcd.io/bbolt"

	"gamebk/internal/model"
)

type GameRepository struct {
	db *bbolt.DB
}

func (r *GameRepository) Create(ctx context.Context, g *model.Game) error {
	nowTime := now()
	g.CreatedAt = nowTime
	g.UpdatedAt = nowTime

	return r.db.Update(func(tx *bbolt.Tx) error {
		meta := tx.Bucket([]byte(bucketMeta))
		games := tx.Bucket([]byte(bucketGames))
		if meta == nil || games == nil {
			return bbolt.ErrBucketNotFound
		}
		next := nextID(meta.Get([]byte(keyNextGameID)))
		meta.Put([]byte(keyNextGameID), putUint64(nil, next))
		g.ID = int64(next)

		data, err := json.Marshal(g)
		if err != nil {
			return err
		}
		return games.Put(putUint64(nil, next), data)
	})
}

func (r *GameRepository) List(ctx context.Context) ([]model.Game, error) {
	var out []model.Game
	if err := r.db.View(func(tx *bbolt.Tx) error {
		games := tx.Bucket([]byte(bucketGames))
		if games == nil {
			return bbolt.ErrBucketNotFound
		}
		return games.ForEach(func(k, v []byte) error {
			var g model.Game
			if err := json.Unmarshal(v, &g); err != nil {
				return err
			}
			out = append(out, g)
			return nil
		})
	}); err != nil {
		return nil, err
	}

	// order by id desc
	for i, j := 0, len(out)-1; i < j; i, j = i+1, j-1 {
		out[i], out[j] = out[j], out[i]
	}
	return out, nil
}

func (r *GameRepository) GetByID(ctx context.Context, id int64) (*model.Game, error) {
	var g *model.Game
	key := putUint64(nil, uint64(id))
	if err := r.db.View(func(tx *bbolt.Tx) error {
		games := tx.Bucket([]byte(bucketGames))
		if games == nil {
			return bbolt.ErrBucketNotFound
		}
		v := games.Get(key)
		if v == nil {
			return ErrNotFound
		}
		var obj model.Game
		if err := json.Unmarshal(v, &obj); err != nil {
			return err
		}
		g = &obj
		return nil
	}); err != nil {
		return nil, err
	}
	return g, nil
}

func (r *GameRepository) UpdateLastBackupAt(ctx context.Context, gameID int64, t time.Time) error {
	return r.db.Update(func(tx *bbolt.Tx) error {
		games := tx.Bucket([]byte(bucketGames))
		if games == nil {
			return bbolt.ErrBucketNotFound
		}
		key := putUint64(nil, uint64(gameID))
		v := games.Get(key)
		if v == nil {
			return ErrNotFound
		}
		var g model.Game
		if err := json.Unmarshal(v, &g); err != nil {
			return err
		}
		g.LastBackupAt = &t
		g.UpdatedAt = now()
		data, err := json.Marshal(&g)
		if err != nil {
			return err
		}
		return games.Put(key, data)
	})
}

func (r *GameRepository) Update(ctx context.Context, g *model.Game) error {
	return r.db.Update(func(tx *bbolt.Tx) error {
		games := tx.Bucket([]byte(bucketGames))
		if games == nil {
			return bbolt.ErrBucketNotFound
		}
		key := putUint64(nil, uint64(g.ID))
		v := games.Get(key)
		if v == nil {
			return ErrNotFound
		}
		var existing model.Game
		if err := json.Unmarshal(v, &existing); err != nil {
			return err
		}
		existing.Name = g.Name
		existing.GamePath = g.GamePath
		existing.BackupRoot = g.BackupRoot
		existing.UpdatedAt = now()
		data, err := json.Marshal(&existing)
		if err != nil {
			return err
		}
		return games.Put(key, data)
	})
}
