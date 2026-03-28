package utils

import (
	"encoding/json"
	"reflect"
	"time"
)

var timeType = reflect.TypeOf(time.Time{})

// NormalizeTimeFieldsToVietnam converts every time.Time field in a payload to Vietnam timezone.
// It works recursively for structs, pointers, slices, arrays, maps, and interface values.
func NormalizeTimeFieldsToVietnam(data interface{}) interface{} {
	if data == nil {
		return nil
	}
	return normalizeValue(reflect.ValueOf(data)).Interface()
}

// MarshalVietnamJSON marshals payload to JSON after converting all time.Time values to Asia/Ho_Chi_Minh.
func MarshalVietnamJSON(data interface{}) ([]byte, error) {
	normalized := NormalizeTimeFieldsToVietnam(data)
	return json.Marshal(normalized)
}

func normalizeValue(v reflect.Value) reflect.Value {
	if !v.IsValid() {
		return v
	}

	if v.Type() == timeType {
		t := v.Interface().(time.Time)
		return reflect.ValueOf(ToVietnamTime(t))
	}

	switch v.Kind() {
	case reflect.Pointer:
		if v.IsNil() {
			return v
		}
		normalizedElem := normalizeValue(v.Elem())
		out := reflect.New(v.Elem().Type())
		setCompatible(out.Elem(), normalizedElem)
		return out

	case reflect.Interface:
		if v.IsNil() {
			return v
		}
		return normalizeValue(v.Elem())

	case reflect.Struct:
		out := reflect.New(v.Type()).Elem()
		for i := 0; i < v.NumField(); i++ {
			field := v.Field(i)
			structField := v.Type().Field(i)
			dst := out.Field(i)

			if structField.PkgPath != "" {
				dst.Set(field)
				continue
			}

			normalizedField := normalizeValue(field)
			setCompatible(dst, normalizedField)
		}
		return out

	case reflect.Slice:
		if v.IsNil() {
			return v
		}
		out := reflect.MakeSlice(v.Type(), v.Len(), v.Len())
		for i := 0; i < v.Len(); i++ {
			normalizedElem := normalizeValue(v.Index(i))
			setCompatible(out.Index(i), normalizedElem)
		}
		return out

	case reflect.Array:
		out := reflect.New(v.Type()).Elem()
		for i := 0; i < v.Len(); i++ {
			normalizedElem := normalizeValue(v.Index(i))
			setCompatible(out.Index(i), normalizedElem)
		}
		return out

	case reflect.Map:
		if v.IsNil() {
			return v
		}
		out := reflect.MakeMapWithSize(v.Type(), v.Len())
		iter := v.MapRange()
		for iter.Next() {
			k := iter.Key()
			val := normalizeValue(iter.Value())
			if converted, ok := valueForType(val, v.Type().Elem()); ok {
				out.SetMapIndex(k, converted)
			} else {
				out.SetMapIndex(k, iter.Value())
			}
		}
		return out

	default:
		return v
	}
}

func setCompatible(dst reflect.Value, src reflect.Value) {
	if !dst.CanSet() || !src.IsValid() {
		return
	}

	if converted, ok := valueForType(src, dst.Type()); ok {
		dst.Set(converted)
	}
}

func valueForType(v reflect.Value, targetType reflect.Type) (reflect.Value, bool) {
	if !v.IsValid() {
		return reflect.Value{}, false
	}

	if v.Type().AssignableTo(targetType) {
		return v, true
	}

	if v.Type().ConvertibleTo(targetType) {
		return v.Convert(targetType), true
	}

	if targetType.Kind() == reflect.Interface {
		return v, true
	}

	return reflect.Value{}, false
}
