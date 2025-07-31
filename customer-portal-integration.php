<?php
/**
 * Plugin Name: Customer Portal Integration
 * Plugin URI: https://yourwebsite.com
 * Description: Integrates customer portal functionality with OAuth, QuickBooks, Google Drive, and SMS capabilities
 * Version: 1.0.0
 * Author: Your Name
 * License: GPL v2 or later
 * Text Domain: customer-portal-integration
 */

// Prevent direct access
if (!defined('ABSPATH')) {
    exit;
}

// Define plugin constants
define('CPI_PLUGIN_URL', plugin_dir_url(__FILE__));
define('CPI_PLUGIN_PATH', plugin_dir_path(__FILE__));
define('CPI_VERSION', '1.0.0');

class CustomerPortalIntegration {
    
    private $db;
    private $table_name;
    
    public function __construct() {
        global $wpdb;
        $this->db = $wpdb;
        $this->table_name = $wpdb->prefix . 'customer_portal_customers';
        
        // Initialize the plugin
        add_action('init', array($this, 'init'));
        add_action('admin_menu', array($this, 'add_admin_menu'));
        add_action('wp_ajax_cpi_save_settings', array($this, 'save_settings'));
        add_action('wp_ajax_cpi_get_customers', array($this, 'get_customers'));
        add_action('wp_ajax_cpi_update_customer', array($this, 'update_customer'));
        add_action('wp_ajax_cpi_delete_customer', array($this, 'delete_customer'));
        add_action('wp_ajax_cpi_test_oauth', array($this, 'test_oauth'));
        add_action('wp_ajax_cpi_send_sms', array($this, 'send_sms'));
        add_action('wp_ajax_cpi_export_data', array($this, 'export_data'));
        
        // Register activation and deactivation hooks
        register_activation_hook(__FILE__, array($this, 'activate'));
        register_deactivation_hook(__FILE__, array($this, 'deactivate'));
        
        // Add shortcodes
        add_shortcode('customer_portal', array($this, 'customer_portal_shortcode'));
        add_shortcode('oauth_login', array($this, 'oauth_login_shortcode'));
        
        // Add REST API endpoints
        add_action('rest_api_init', array($this, 'register_rest_routes'));
    }
    
    public function init() {
        // Load text domain for translations
        load_plugin_textdomain('customer-portal-integration', false, dirname(plugin_basename(__FILE__)) . '/languages');
    }
    
    public function activate() {
        // Create database tables
        $this->create_tables();
        
        // Set default options
        $this->set_default_options();
        
        // Flush rewrite rules
        flush_rewrite_rules();
    }
    
    public function deactivate() {
        // Clean up if needed
        flush_rewrite_rules();
    }
    
    private function create_tables() {
        $charset_collate = $this->db->get_charset_collate();
        
        $sql = "CREATE TABLE {$this->table_name} (
            id varchar(36) NOT NULL,
            email varchar(255) NOT NULL,
            name varchar(255),
            picture text,
            google_access_token text,
            google_refresh_token text,
            scopes text,
            token_expiry datetime,
            qb_access_token text,
            qb_refresh_token text,
            qb_company_id varchar(255),
            qb_token_expiry datetime,
            qb_base_url text,
            selected_spreadsheet_id varchar(255),
            selected_spreadsheet_name varchar(255),
            spreadsheet_selected_at datetime,
            created_at datetime DEFAULT CURRENT_TIMESTAMP,
            updated_at datetime DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY email (email)
        ) $charset_collate;";
        
        require_once(ABSPATH . 'wp-admin/includes/upgrade.php');
        dbDelta($sql);
        
        // Create spreadsheets table
        $spreadsheets_table = $this->db->prefix . 'customer_portal_spreadsheets';
        $sql_spreadsheets = "CREATE TABLE {$spreadsheets_table} (
            id int(11) NOT NULL AUTO_INCREMENT,
            customer_id varchar(36) NOT NULL,
            file_id varchar(255) NOT NULL,
            file_name varchar(255) NOT NULL,
            purpose varchar(255),
            selected_at datetime DEFAULT CURRENT_TIMESTAMP,
            created_at datetime DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY customer_file (customer_id, file_id),
            FOREIGN KEY (customer_id) REFERENCES {$this->table_name} (id) ON DELETE CASCADE
        ) $charset_collate;";
        
        dbDelta($sql_spreadsheets);
    }
    
    private function set_default_options() {
        $default_options = array(
            'google_client_id' => '',
            'google_client_secret' => '',
            'google_callback_url' => home_url('/wp-json/customer-portal/v1/oauth/google/callback'),
            'qb_client_id_prod' => '',
            'qb_client_secret_prod' => '',
            'qb_client_id_sandbox' => '',
            'qb_client_secret_sandbox' => '',
            'qb_callback_url' => home_url('/wp-json/customer-portal/v1/oauth/quickbooks/callback'),
            'qb_environment' => 'sandbox',
            'sms_api_key' => '',
            'sms_api_secret' => '',
            'admin_emails' => 'admin@yourwebsite.com',
            'session_secret' => wp_generate_password(32, false),
            'facebook_app_id' => '',
            'facebook_app_secret' => '',
            'telegram_bot_token' => '',
            'telegram_webhook_url' => home_url('/wp-json/customer-portal/v1/telegram/webhook')
        );
        
        foreach ($default_options as $key => $value) {
            if (get_option('cpi_' . $key) === false) {
                update_option('cpi_' . $key, $value);
            }
        }
    }
    
    public function add_admin_menu() {
        add_menu_page(
            'Customer Portal',
            'Customer Portal',
            'manage_options',
            'customer-portal',
            array($this, 'admin_page'),
            'dashicons-groups',
            30
        );
        
        add_submenu_page(
            'customer-portal',
            'Settings',
            'Settings',
            'manage_options',
            'customer-portal-settings',
            array($this, 'settings_page')
        );
        
        add_submenu_page(
            'customer-portal',
            'Customers',
            'Customers',
            'manage_options',
            'customer-portal-customers',
            array($this, 'customers_page')
        );
        
        add_submenu_page(
            'customer-portal',
            'Integrations',
            'Integrations',
            'manage_options',
            'customer-portal-integrations',
            array($this, 'integrations_page')
        );
    }
    
    public function admin_page() {
        include CPI_PLUGIN_PATH . 'admin/dashboard.php';
    }
    
    public function settings_page() {
        include CPI_PLUGIN_PATH . 'admin/settings.php';
    }
    
    public function customers_page() {
        include CPI_PLUGIN_PATH . 'admin/customers.php';
    }
    
    public function integrations_page() {
        include CPI_PLUGIN_PATH . 'admin/integrations.php';
    }
    
    public function save_settings() {
        check_ajax_referer('cpi_nonce', 'nonce');
        
        if (!current_user_can('manage_options')) {
            wp_die('Unauthorized');
        }
        
        $settings = array(
            'google_client_id',
            'google_client_secret',
            'google_callback_url',
            'qb_client_id_prod',
            'qb_client_secret_prod',
            'qb_client_id_sandbox',
            'qb_client_secret_sandbox',
            'qb_callback_url',
            'qb_environment',
            'sms_api_key',
            'sms_api_secret',
            'admin_emails',
            'facebook_app_id',
            'facebook_app_secret',
            'telegram_bot_token'
        );
        
        foreach ($settings as $setting) {
            if (isset($_POST[$setting])) {
                update_option('cpi_' . $setting, sanitize_text_field($_POST[$setting]));
            }
        }
        
        wp_send_json_success('Settings saved successfully');
    }
    
    public function get_customers() {
        check_ajax_referer('cpi_nonce', 'nonce');
        
        if (!current_user_can('manage_options')) {
            wp_die('Unauthorized');
        }
        
        $customers = $this->db->get_results("SELECT * FROM {$this->table_name} ORDER BY created_at DESC");
        
        wp_send_json_success($customers);
    }
    
    public function update_customer() {
        check_ajax_referer('cpi_nonce', 'nonce');
        
        if (!current_user_can('manage_options')) {
            wp_die('Unauthorized');
        }
        
        $customer_id = sanitize_text_field($_POST['id']);
        $data = array(
            'name' => sanitize_text_field($_POST['name']),
            'email' => sanitize_email($_POST['email']),
            'updated_at' => current_time('mysql')
        );
        
        $result = $this->db->update($this->table_name, $data, array('id' => $customer_id));
        
        if ($result !== false) {
            wp_send_json_success('Customer updated successfully');
        } else {
            wp_send_json_error('Failed to update customer');
        }
    }
    
    public function delete_customer() {
        check_ajax_referer('cpi_nonce', 'nonce');
        
        if (!current_user_can('manage_options')) {
            wp_die('Unauthorized');
        }
        
        $customer_id = sanitize_text_field($_POST['id']);
        
        $result = $this->db->delete($this->table_name, array('id' => $customer_id));
        
        if ($result !== false) {
            wp_send_json_success('Customer deleted successfully');
        } else {
            wp_send_json_error('Failed to delete customer');
        }
    }
    
    public function test_oauth() {
        check_ajax_referer('cpi_nonce', 'nonce');
        
        if (!current_user_can('manage_options')) {
            wp_die('Unauthorized');
        }
        
        $provider = sanitize_text_field($_POST['provider']);
        
        // Test OAuth configuration
        $result = $this->test_oauth_configuration($provider);
        
        wp_send_json_success($result);
    }
    
    private function test_oauth_configuration($provider) {
        switch ($provider) {
            case 'google':
                $client_id = get_option('cpi_google_client_id');
                $client_secret = get_option('cpi_google_client_secret');
                return array(
                    'status' => !empty($client_id) && !empty($client_secret) ? 'configured' : 'not_configured',
                    'message' => !empty($client_id) && !empty($client_secret) ? 'Google OAuth is configured' : 'Please configure Google OAuth credentials'
                );
                
            case 'quickbooks':
                $environment = get_option('cpi_qb_environment', 'sandbox');
                $client_id = get_option('cpi_qb_client_id_' . $environment);
                $client_secret = get_option('cpi_qb_client_secret_' . $environment);
                return array(
                    'status' => !empty($client_id) && !empty($client_secret) ? 'configured' : 'not_configured',
                    'message' => !empty($client_id) && !empty($client_secret) ? 'QuickBooks OAuth is configured' : 'Please configure QuickBooks OAuth credentials'
                );
                
            default:
                return array('status' => 'error', 'message' => 'Unknown provider');
        }
    }
    
    public function send_sms() {
        check_ajax_referer('cpi_nonce', 'nonce');
        
        if (!current_user_can('manage_options')) {
            wp_die('Unauthorized');
        }
        
        $to = sanitize_text_field($_POST['to']);
        $message = sanitize_textarea_field($_POST['message']);
        
        $result = $this->send_sms_message($to, $message);
        
        wp_send_json_success($result);
    }
    
    private function send_sms_message($to, $message) {
        // Implement SMS sending logic here
        // This would integrate with your existing SMS functionality
        return array('status' => 'sent', 'message' => 'SMS sent successfully');
    }
    
    public function export_data() {
        check_ajax_referer('cpi_nonce', 'nonce');
        
        if (!current_user_can('manage_options')) {
            wp_die('Unauthorized');
        }
        
        $customers = $this->db->get_results("SELECT * FROM {$this->table_name}", ARRAY_A);
        
        $filename = 'customer-portal-export-' . date('Y-m-d-H-i-s') . '.csv';
        
        header('Content-Type: text/csv');
        header('Content-Disposition: attachment; filename="' . $filename . '"');
        
        $output = fopen('php://output', 'w');
        
        // Add headers
        if (!empty($customers)) {
            fputcsv($output, array_keys($customers[0]));
        }
        
        // Add data
        foreach ($customers as $customer) {
            fputcsv($output, $customer);
        }
        
        fclose($output);
        exit;
    }
    
    public function customer_portal_shortcode($atts) {
        $atts = shortcode_atts(array(
            'page' => 'dashboard'
        ), $atts);
        
        ob_start();
        include CPI_PLUGIN_PATH . 'public/portal.php';
        return ob_get_clean();
    }
    
    public function oauth_login_shortcode($atts) {
        $atts = shortcode_atts(array(
            'provider' => 'google'
        ), $atts);
        
        ob_start();
        include CPI_PLUGIN_PATH . 'public/oauth-login.php';
        return ob_get_clean();
    }
    
    public function register_rest_routes() {
        register_rest_route('customer-portal/v1', '/oauth/google/callback', array(
            'methods' => 'GET',
            'callback' => array($this, 'google_oauth_callback'),
            'permission_callback' => '__return_true'
        ));
        
        register_rest_route('customer-portal/v1', '/oauth/quickbooks/callback', array(
            'methods' => 'GET',
            'callback' => array($this, 'quickbooks_oauth_callback'),
            'permission_callback' => '__return_true'
        ));
        
        register_rest_route('customer-portal/v1', '/telegram/webhook', array(
            'methods' => 'POST',
            'callback' => array($this, 'telegram_webhook'),
            'permission_callback' => '__return_true'
        ));
    }
    
    public function google_oauth_callback($request) {
        // Handle Google OAuth callback
        $code = $request->get_param('code');
        
        if ($code) {
            // Exchange code for tokens
            $tokens = $this->exchange_google_code($code);
            
            if ($tokens) {
                // Get user info
                $user_info = $this->get_google_user_info($tokens['access_token']);
                
                if ($user_info) {
                    // Store or update customer
                    $this->store_google_customer($user_info, $tokens);
                    
                    // Redirect to success page
                    wp_redirect(home_url('/customer-portal?status=success'));
                    exit;
                }
            }
        }
        
        // Redirect to error page
        wp_redirect(home_url('/customer-portal?status=error'));
        exit;
    }
    
    public function quickbooks_oauth_callback($request) {
        // Handle QuickBooks OAuth callback
        $code = $request->get_param('code');
        $realm_id = $request->get_param('realmId');
        
        if ($code && $realm_id) {
            // Exchange code for tokens
            $tokens = $this->exchange_quickbooks_code($code, $realm_id);
            
            if ($tokens) {
                // Update customer with QuickBooks tokens
                $this->update_customer_quickbooks_tokens($realm_id, $tokens);
                
                // Redirect to success page
                wp_redirect(home_url('/customer-portal?status=qb_success'));
                exit;
            }
        }
        
        // Redirect to error page
        wp_redirect(home_url('/customer-portal?status=error'));
        exit;
    }
    
    public function telegram_webhook($request) {
        // Handle Telegram webhook
        $update = $request->get_json_params();
        
        if ($update && isset($update['message'])) {
            $this->handle_telegram_message($update['message']);
        }
        
        return new WP_REST_Response(array('status' => 'ok'), 200);
    }
    
    private function exchange_google_code($code) {
        $client_id = get_option('cpi_google_client_id');
        $client_secret = get_option('cpi_google_client_secret');
        $redirect_uri = get_option('cpi_google_callback_url');
        
        $response = wp_remote_post('https://oauth2.googleapis.com/token', array(
            'body' => array(
                'code' => $code,
                'client_id' => $client_id,
                'client_secret' => $client_secret,
                'redirect_uri' => $redirect_uri,
                'grant_type' => 'authorization_code'
            )
        ));
        
        if (!is_wp_error($response)) {
            $body = wp_remote_retrieve_body($response);
            return json_decode($body, true);
        }
        
        return false;
    }
    
    private function get_google_user_info($access_token) {
        $response = wp_remote_get('https://www.googleapis.com/oauth2/v2/userinfo', array(
            'headers' => array(
                'Authorization' => 'Bearer ' . $access_token
            )
        ));
        
        if (!is_wp_error($response)) {
            $body = wp_remote_retrieve_body($response);
            return json_decode($body, true);
        }
        
        return false;
    }
    
    private function store_google_customer($user_info, $tokens) {
        $customer_id = wp_generate_uuid4();
        
        $data = array(
            'id' => $customer_id,
            'email' => $user_info['email'],
            'name' => $user_info['name'],
            'picture' => $user_info['picture'],
            'google_access_token' => $tokens['access_token'],
            'google_refresh_token' => isset($tokens['refresh_token']) ? $tokens['refresh_token'] : '',
            'scopes' => 'profile email https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/contacts https://www.googleapis.com/auth/calendar',
            'token_expiry' => date('Y-m-d H:i:s', time() + $tokens['expires_in']),
            'created_at' => current_time('mysql'),
            'updated_at' => current_time('mysql')
        );
        
        $this->db->insert($this->table_name, $data);
    }
    
    private function exchange_quickbooks_code($code, $realm_id) {
        $environment = get_option('cpi_qb_environment', 'sandbox');
        $client_id = get_option('cpi_qb_client_id_' . $environment);
        $client_secret = get_option('cpi_qb_client_secret_' . $environment);
        $redirect_uri = get_option('cpi_qb_callback_url');
        
        $response = wp_remote_post('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', array(
            'body' => array(
                'code' => $code,
                'client_id' => $client_id,
                'client_secret' => $client_secret,
                'redirect_uri' => $redirect_uri,
                'grant_type' => 'authorization_code'
            )
        ));
        
        if (!is_wp_error($response)) {
            $body = wp_remote_retrieve_body($response);
            $tokens = json_decode($body, true);
            
            if (isset($tokens['access_token'])) {
                $tokens['realm_id'] = $realm_id;
                return $tokens;
            }
        }
        
        return false;
    }
    
    private function update_customer_quickbooks_tokens($realm_id, $tokens) {
        // Update the current customer's QuickBooks tokens
        // This would need to be tied to the current session
        $customer_id = $this->get_current_customer_id();
        
        if ($customer_id) {
            $data = array(
                'qb_access_token' => $tokens['access_token'],
                'qb_refresh_token' => $tokens['refresh_token'],
                'qb_company_id' => $realm_id,
                'qb_token_expiry' => date('Y-m-d H:i:s', time() + $tokens['expires_in']),
                'qb_base_url' => get_option('cpi_qb_environment') === 'sandbox' ? 'https://sandbox-accounts.platform.intuit.com' : 'https://accounts.platform.intuit.com',
                'updated_at' => current_time('mysql')
            );
            
            $this->db->update($this->table_name, $data, array('id' => $customer_id));
        }
    }
    
    private function get_current_customer_id() {
        // Get current customer ID from session
        if (isset($_SESSION['customer_id'])) {
            return $_SESSION['customer_id'];
        }
        
        return null;
    }
    
    private function handle_telegram_message($message) {
        $bot_token = get_option('cpi_telegram_bot_token');
        
        if (!$bot_token) {
            return;
        }
        
        $chat_id = $message['chat']['id'];
        $text = $message['text'] ?? '';
        
        // Handle different commands
        switch ($text) {
            case '/start':
                $response = "Welcome to the Customer Portal! Use /help for available commands.";
                break;
                
            case '/help':
                $response = "Available commands:\n/start - Start the bot\n/help - Show this help\n/status - Check your account status";
                break;
                
            case '/status':
                $response = "Your account is active and connected.";
                break;
                
            default:
                $response = "I don't understand that command. Use /help for available commands.";
        }
        
        // Send response
        wp_remote_post("https://api.telegram.org/bot{$bot_token}/sendMessage", array(
            'body' => array(
                'chat_id' => $chat_id,
                'text' => $response
            )
        ));
    }
}

// Initialize the plugin
new CustomerPortalIntegration(); 