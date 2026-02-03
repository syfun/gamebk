package repository

import (
	"encoding/binary"
	"errors"
	"time"
)

var ErrNotFound = errors.New("not found")

const (
	bucketMeta    = "meta"
	bucketGames   = "games"
	bucketBackups = "backups"
)

const (
	keyNextGameID   = "next_game_id"
	keyNextBackupID = "next_backup_id"
)

func nextID(current []byte) uint64 {
	if len(current) == 8 {
		return binary.BigEndian.Uint64(current) + 1
	}
	return 1
}

func putUint64(dst []byte, v uint64) []byte {
	if dst == nil || len(dst) < 8 {
		dst = make([]byte, 8)
	}
	binary.BigEndian.PutUint64(dst, v)
	return dst
}

// getUint64 从字节数组中获取uint64值
func getUint64(b []byte) uint64 {
	return binary.BigEndian.Uint64(b)
}

func now() time.Time {
	return time.Now().UTC()
}
