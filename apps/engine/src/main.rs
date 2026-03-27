use engine_core::Engine;

fn main() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();
    log::info!("Ripcord Engine starting...");

    let engine = Engine::new();
    engine.run();
}
