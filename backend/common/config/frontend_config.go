package config

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"

	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/ssm"
	ssmtypes "github.com/aws/aws-sdk-go-v2/service/ssm/types"
	"github.com/aws/aws-sdk-go/aws"
)

// GuestVideoItem đại diện cho một video trên trang guest
type GuestVideoItem struct {
	ID           string `json:"id"`
	Title        string `json:"title"`
	Description  string `json:"description,omitempty"`
	URL          string `json:"url"`
	ThumbnailURL string `json:"thumbnailUrl,omitempty"`
	Order        int    `json:"order"`
}

// HeroImageItem đại diện cho một ảnh trong collage floating ở Hero section
type HeroImageItem struct {
	ID    string `json:"id"`
	Title string `json:"title"`
	Image string `json:"image"`
	Order int    `json:"order"`
}

// BrandPartnerItem đại diện cho một logo đối tác/brand ở marquee carousel
type BrandPartnerItem struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	LogoURL string `json:"logoUrl"`
	Website string `json:"website,omitempty"`
	Order   int    `json:"order"`
}

// SectionVisibilityConfig cấu hình bật/tắt các section trên trang guest
type SectionVisibilityConfig struct {
	Hero     bool `json:"hero"`
	Videos   bool `json:"videos"`
	Brands   bool `json:"brands"`
	Events   bool `json:"events"`
	Stats    bool `json:"stats"`
	Features bool `json:"features"`
	Footer   bool `json:"footer"`
}

// FrontendConfig chứa cấu hình frontend có thể quản lý bởi Admin
type FrontendConfig struct {
	Videos                []GuestVideoItem        `json:"videos"`
	VideoShowcaseBadge    string                  `json:"videoShowcaseBadge,omitempty"`
	VideoShowcaseTitle    string                  `json:"videoShowcaseTitle,omitempty"`
	VideoShowcaseSubtitle string                  `json:"videoShowcaseSubtitle,omitempty"`
	HeroImages            []HeroImageItem         `json:"heroImages,omitempty"`
	Brands                []BrandPartnerItem      `json:"brands,omitempty"`
	BrandSectionTitle     string                  `json:"brandSectionTitle,omitempty"`
	BrandSectionSubtitle  string                  `json:"brandSectionSubtitle,omitempty"`
	Sections              SectionVisibilityConfig `json:"sections"`
	HeroAnnouncementText  string                  `json:"heroAnnouncementText,omitempty"`
}

var (
	globalFrontendConfig *FrontendConfig
	frontendConfigMutex  sync.RWMutex
	frontendConfigPath   = "config/frontend_config.json"
)

// DefaultFrontendConfig trả về cấu hình mặc định ban đầu
func DefaultFrontendConfig() *FrontendConfig {
	return &FrontendConfig{
		Videos:                []GuestVideoItem{},
		VideoShowcaseBadge:    "Thước Phim Sự Kiện",
		VideoShowcaseTitle:    "Sôi Động & Sáng Tạo Tại FPT Education",
		VideoShowcaseSubtitle: "Cảm nhận năng lượng nhiệt huyết từ các chương trình, hoạt động văn hóa và lễ hội bùng nổ.",
		HeroImages: []HeroImageItem{
			{ID: "h-1", Title: "FPT AI & Tech Hackathon 2026", Image: "https://images.unsplash.com/photo-1504384308090-c894fdcc538d?auto=format&fit=crop&w=500&q=80", Order: 1},
			{ID: "h-2", Title: "F-Camp Gala & Sunset Acoustic", Image: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=500&q=80", Order: 2},
			{ID: "h-3", Title: "FPT University Career Day 2026", Image: "https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=500&q=80", Order: 3},
			{ID: "h-4", Title: "Vovinam Championship Final Cup", Image: "https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&w=500&q=80", Order: 4},
			{ID: "h-5", Title: "Design & Creative Media Showcase", Image: "https://images.unsplash.com/photo-1513364776144-60967b0f800f?auto=format&fit=crop&w=500&q=80", Order: 5},
			{ID: "h-6", Title: "Startup & Business Pitching Arena", Image: "https://images.unsplash.com/photo-1556761175-5973dc0f32e7?auto=format&fit=crop&w=500&q=80", Order: 6},
			{ID: "h-7", Title: "FPT Esports Championship Valorant", Image: "https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=500&q=80", Order: 7},
			{ID: "h-8", Title: "Global Cultural Exchange Festival", Image: "https://images.unsplash.com/photo-1511578314322-379afb476865?auto=format&fit=crop&w=500&q=80", Order: 8},
			{ID: "h-9", Title: "Robotics & Drone Racing Arena", Image: "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?auto=format&fit=crop&w=500&q=80", Order: 9},
			{ID: "h-10", Title: "TEDx FPT University Talkshow", Image: "https://images.unsplash.com/photo-1475721027785-f74eccf877e2?auto=format&fit=crop&w=500&q=80", Order: 10},
		},
		Brands: []BrandPartnerItem{
			// HÀNG 1: Các ngân hàng, viễn thông và ví điện tử hàng đầu
			{ID: "b-1", Name: "TPBank", LogoURL: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/TPBank_logo.svg/320px-TPBank_logo.svg.png", Website: "https://tpb.vn", Order: 1},
			{ID: "b-2", Name: "MoMo", LogoURL: "https://upload.wikimedia.org/wikipedia/vi/f/fe/MoMo_Logo.png", Website: "https://momo.vn", Order: 2},
			{ID: "b-3", Name: "VietCredit", LogoURL: "https://vietcredit.vn/wp-content/themes/vietcredit/images/logo.png", Website: "https://vietcredit.vn", Order: 3},
			{ID: "b-4", Name: "VNPAY", LogoURL: "https://vnpay.vn/s1/statics/img/logo.svg", Website: "https://vnpay.vn", Order: 4},
			{ID: "b-5", Name: "moneyveo", LogoURL: "https://moneyveo.vn/images/logo.svg", Website: "https://moneyveo.vn", Order: 5},
			{ID: "b-6", Name: "Sacombank", LogoURL: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/Sacombank_logo.svg/320px-Sacombank_logo.svg.png", Website: "https://sacombank.com.vn", Order: 6},
			{ID: "b-7", Name: "MIRAE ASSET", LogoURL: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Mirae_Asset_Financial_Group_Logo.svg/320px-Mirae_Asset_Financial_Group_Logo.svg.png", Website: "https://mafc.com.vn", Order: 7},
			{ID: "b-8", Name: "HDBank", LogoURL: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/69/HDBank_logo.svg/320px-HDBank_logo.svg.png", Website: "https://hdbank.com.vn", Order: 8},
			{ID: "b-9", Name: "Viettel", LogoURL: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fe/Viettel_logo_2021.svg/320px-Viettel_logo_2021.svg.png", Website: "https://viettel.vn", Order: 9},
			{ID: "b-10", Name: "Mobifone", LogoURL: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Mobifone_logo.svg/320px-Mobifone_logo.svg.png", Website: "https://mobifone.vn", Order: 10},

			// HÀNG 2: Cơ quan, truyền thông, giải trí & công nghệ
			{ID: "b-11", Name: "Bộ Xây Dựng", LogoURL: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/Emblem_of_Vietnam.svg/200px-Emblem_of_Vietnam.svg.png", Website: "https://moc.gov.vn", Order: 11},
			{ID: "b-12", Name: "Việt Ba Media", LogoURL: "https://vietba.com.vn/wp-content/uploads/2020/09/logo-viet-ba-media.png", Website: "https://vietba.com.vn", Order: 12},
			{ID: "b-13", Name: "Dân Trí", LogoURL: "https://icdn.dantri.com.vn/web/styles/img/logo.png", Website: "https://dantri.com.vn", Order: 13},
			{ID: "b-14", Name: "SAVIS", LogoURL: "https://savis.vn/wp-content/uploads/2021/04/logo-savis.png", Website: "https://savis.vn", Order: 14},
			{ID: "b-15", Name: "SMARTNet", LogoURL: "https://smartnetvn.com.vn/images/logo.png", Website: "https://smartnetvn.com.vn", Order: 15},
			{ID: "b-16", Name: "Tinh Vân Group", LogoURL: "https://tinhvan.com/wp-content/uploads/2019/08/logo-tinhvan-official.png", Website: "https://tinhvan.com", Order: 16},
			{ID: "b-17", Name: "Base.vn", LogoURL: "https://share-gcdn.basecdn.net/brand/logo.full.png", Website: "https://base.vn", Order: 17},
			{ID: "b-18", Name: "Beatvn", LogoURL: "https://beat.vn/wp-content/uploads/2021/08/logo-beat-1.png", Website: "https://beat.vn", Order: 18},
			{ID: "b-19", Name: "Vie Channel", LogoURL: "https://viechannel.vn/images/logo.png", Website: "https://viechannel.vn", Order: 19},
			{ID: "b-20", Name: "King News", LogoURL: "https://kingnews.vn/wp-content/uploads/2021/06/logo-kingnews.png", Website: "https://kingnews.vn", Order: 20},
		},
		BrandSectionTitle:    "Được tin tưởng và đánh giá cao bởi",
		BrandSectionSubtitle: "300+ đối tác, doanh nghiệp & tổ chức câu lạc bộ",
		Sections: SectionVisibilityConfig{
			Hero:     true,
			Videos:   true,
			Brands:   true,
			Events:   true,
			Stats:    true,
			Features: true,
			Footer:   true,
		},
		HeroAnnouncementText: "",
	}
}

func ssmFrontendParamName() string {
	if v := os.Getenv("SSM_FRONTEND_CONFIG_PATH"); v != "" {
		return v
	}
	env := os.Getenv("ENV")
	if env == "" {
		env = "production"
	}
	return fmt.Sprintf("/fpt-event-management/%s/frontend_config", env)
}

// LoadFrontendConfig đọc cấu hình từ file (Local) hoặc SSM (AWS)
func LoadFrontendConfig() *FrontendConfig {
	frontendConfigMutex.RLock()
	if globalFrontendConfig != nil {
		frontendConfigMutex.RUnlock()
		return globalFrontendConfig
	}
	frontendConfigMutex.RUnlock()

	frontendConfigMutex.Lock()
	defer frontendConfigMutex.Unlock()

	if globalFrontendConfig != nil {
		return globalFrontendConfig
	}

	var cfg *FrontendConfig
	if isLocal() {
		cfg = loadFrontendConfigFromFile()
	} else {
		cfg = loadFrontendConfigFromSSM()
	}

	if cfg == nil {
		cfg = DefaultFrontendConfig()
	}

	globalFrontendConfig = cfg
	return globalFrontendConfig
}

func loadFrontendConfigFromFile() *FrontendConfig {
	candidates := []string{
		frontendConfigPath,
		filepath.Join("..", frontendConfigPath),
		filepath.Join("..", "..", frontendConfigPath),
		filepath.Join("/app", frontendConfigPath),
		filepath.Join("/app/backend", frontendConfigPath),
	}

	var data []byte
	var err error
	found := false

	for _, p := range candidates {
		data, err = os.ReadFile(p)
		if err == nil {
			found = true
			break
		}
	}

	if !found {
		fmt.Printf("[INFO] Frontend config file not found, using default config\n")
		cfg := DefaultFrontendConfig()
		_ = saveFrontendConfigToFile(cfg)
		return cfg
	}

	cfg := &FrontendConfig{}
	if jsonErr := json.Unmarshal(data, cfg); jsonErr != nil {
		fmt.Printf("[WARN] Failed to parse frontend_config.json: %v. Using defaults.\n", jsonErr)
		return DefaultFrontendConfig()
	}

	return cfg
}

func loadFrontendConfigFromSSM() *FrontendConfig {
	paramName := ssmFrontendParamName()
	ctx := context.Background()

	awsCfg, err := awsconfig.LoadDefaultConfig(ctx)
	if err != nil {
		fmt.Printf("[WARN] SSM: failed to load AWS config: %v. Using defaults.\n", err)
		return DefaultFrontendConfig()
	}

	client := ssm.NewFromConfig(awsCfg)
	output, err := client.GetParameter(ctx, &ssm.GetParameterInput{
		Name:           aws.String(paramName),
		WithDecryption: aws.Bool(false),
	})
	if err != nil {
		fmt.Printf("[WARN] SSM: failed to get parameter %s: %v. Using defaults.\n", paramName, err)
		return DefaultFrontendConfig()
	}

	cfg := DefaultFrontendConfig()
	if output.Parameter != nil && output.Parameter.Value != nil {
		if jsonErr := json.Unmarshal([]byte(*output.Parameter.Value), cfg); jsonErr != nil {
			fmt.Printf("[WARN] SSM: failed to parse frontend config parameter value: %v. Using defaults.\n", jsonErr)
			return DefaultFrontendConfig()
		}
		fmt.Printf("[INFO] Loaded frontend config from SSM: %s\n", paramName)
	}

	return cfg
}

// SaveFrontendConfig lưu cấu hình frontend vào persistent storage
func SaveFrontendConfig(cfg *FrontendConfig) error {
	if cfg == nil {
		return fmt.Errorf("config cannot be nil")
	}

	var err error
	if isLocal() {
		err = saveFrontendConfigToFile(cfg)
	} else {
		err = saveFrontendConfigToSSM(cfg)
	}

	if err != nil {
		return fmt.Errorf("failed to save frontend config: %w", err)
	}

	frontendConfigMutex.Lock()
	globalFrontendConfig = cfg
	frontendConfigMutex.Unlock()

	return nil
}

func saveFrontendConfigToFile(cfg *FrontendConfig) error {
	candidates := []string{
		frontendConfigPath,
		filepath.Join("/app", frontendConfigPath),
		filepath.Join("/app/backend", frontendConfigPath),
		filepath.Join("backend", frontendConfigPath),
	}

	target := frontendConfigPath
	for _, c := range candidates {
		dir := filepath.Dir(c)
		if fi, err := os.Stat(dir); err == nil && fi.IsDir() {
			target = c
			break
		}
	}

	dir := filepath.Dir(target)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("failed to create config dir: %w", err)
	}

	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal frontend config: %w", err)
	}

	if err := os.WriteFile(target, data, 0644); err != nil {
		return fmt.Errorf("failed to write frontend config file %s: %w", target, err)
	}
	return nil
}

func saveFrontendConfigToSSM(cfg *FrontendConfig) error {
	data, err := json.Marshal(cfg)
	if err != nil {
		return fmt.Errorf("failed to marshal frontend config for SSM: %w", err)
	}

	ctx := context.Background()
	awsCfg, err := awsconfig.LoadDefaultConfig(ctx)
	if err != nil {
		return fmt.Errorf("SSM: failed to load AWS config: %w", err)
	}

	client := ssm.NewFromConfig(awsCfg)
	paramName := ssmFrontendParamName()

	_, err = client.PutParameter(ctx, &ssm.PutParameterInput{
		Name:      aws.String(paramName),
		Value:     aws.String(string(data)),
		Type:      ssmtypes.ParameterTypeString,
		Overwrite: aws.Bool(true),
	})
	if err != nil {
		return fmt.Errorf("SSM: failed to put parameter %s: %w", paramName, err)
	}
	return nil
}
